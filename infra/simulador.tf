# Lambda del simulador + EventBridge Scheduler para las rondas de demo (S6, AGENTS.md §2 y R10).
#
# Cada `demo_schedule` el scheduler arranca una ronda de demo, así el mapa público
# nunca queda congelado. La ronda toma el candado de partida activa de forma
# condicional: si una evaluación (o una demo anterior) lo tiene, la invocación
# termina sin escribir nada.
# Antes de una ronda de evaluación hay que deshabilitar las demos: `demo_enabled = false`
# y apply, o `aws scheduler update-schedule ... --state DISABLED` (tools/demo/demo.sh pausar).
# Las rondas de evaluación corren en esta misma Lambda: `tools/demo/demo.sh evaluar 3` la
# invoca con "modo": "evaluacion", y ella llama a POST /paso por HTTP (PASO_URL y PASO_KEY, abajo).
#
# Ejecutar primero `npm run build:simulador`: archive_file comprime tools/simulador/dist/lambda.js.
data "archive_file" "simulador" {
  type        = "zip"
  source_file = "${path.module}/../tools/simulador/dist/lambda.js"
  output_path = "${path.module}/build/simulador.zip"
}

data "aws_caller_identity" "current" {}

resource "aws_cloudwatch_log_group" "simulador" {
  name              = "/aws/lambda/${local.name_prefix}-lambda-simulador"
  retention_in_days = var.log_retention_days
}

resource "aws_iam_role" "simulador" {
  name               = "${local.name_prefix}-lambda-simulador-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

# Mínimo privilegio: su propio log group y solo las escrituras que hace DynamoPersistencia
# (candado, metadatos y turnos mediante TransactWriteItems). Sin lecturas ni Scan.
data "aws_iam_policy_document" "simulador" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.simulador.arn}:*"]
  }

  statement {
    sid = "DynamoWrites"
    actions = [
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:ConditionCheckItem",
    ]
    resources = [aws_dynamodb_table.main.arn]
  }
}

resource "aws_iam_role_policy" "simulador" {
  name   = "${local.name_prefix}-lambda-simulador-policy"
  role   = aws_iam_role.simulador.id
  policy = data.aws_iam_policy_document.simulador.json
}

resource "aws_lambda_function" "simulador" {
  function_name    = "${local.name_prefix}-lambda-simulador"
  runtime          = "nodejs24.x"
  handler          = "lambda.handler"
  architectures    = ["arm64"]
  memory_size      = 1024 # las rondas de evaluación envían hasta 200 pedidos a la vez; más CPU evita que el cliente sume demora
  timeout          = 900  # una ronda dura 5 minutos; 15 minutos es el máximo de Lambda
  role             = aws_iam_role.simulador.arn
  filename         = data.archive_file.simulador.output_path
  source_code_hash = data.archive_file.simulador.output_base64sha256

  environment {
    variables = {
      MUNDO_TABLE = aws_dynamodb_table.main.name
      # Las rondas de evaluación llaman a POST /paso por HTTP desde esta región, directo a API Gateway
      # (sin pasar por CloudFront), así el p95 medido es el del servicio y no el de la conexión del operador.
      PASO_URL = "${aws_apigatewayv2_api.api.api_endpoint}/api/paso"
      # La misma variable sensible que ya recibe la Lambda de la API (TF_VAR_api_key, nunca commiteada).
      PASO_KEY = var.api_key
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.simulador,
    aws_iam_role_policy.simulador,
  ]
}

# Una ronda de demo fallida nunca se reintenta: la siguiente ejecución del schedule arranca una nueva.
resource "aws_lambda_function_event_invoke_config" "simulador" {
  function_name                = aws_lambda_function.simulador.function_name
  maximum_retry_attempts       = 0
  maximum_event_age_in_seconds = 60
}

data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }

    # Protección contra confused deputy: solo los schedules de esta cuenta pueden asumirlo.
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "${local.name_prefix}-scheduler-simulador-role"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
}

data "aws_iam_policy_document" "scheduler" {
  statement {
    sid       = "InvokeSimulador"
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.simulador.arn]
  }
}

resource "aws_iam_role_policy" "scheduler" {
  name   = "${local.name_prefix}-scheduler-simulador-policy"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler.json
}

resource "aws_scheduler_schedule" "demo" {
  name                = "${local.name_prefix}-demo-rondas"
  schedule_expression = var.demo_schedule
  state               = var.demo_enabled ? "ENABLED" : "DISABLED"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.simulador.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ ronda = var.demo_ronda })

    retry_policy {
      maximum_retry_attempts = 0
    }
  }
}
