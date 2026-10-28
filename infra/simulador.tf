# Simulator Lambda + EventBridge Scheduler for demo rounds (S6, AGENTS.md §2 and R10).
#
# Every `demo_schedule` the scheduler starts one demo round, so the public map is
# never frozen. The round takes the active-game lock conditionally: if an
# evaluation (or a previous demo) holds it, the invocation exits without writing.
# Before an evaluation round, disable the demos: `demo_enabled = false` and apply,
# or `aws scheduler update-schedule ... --state DISABLED` (tools/demo/demo.sh pausar).
# Evaluation rounds run on this same Lambda: `tools/demo/demo.sh evaluar 3` invokes it with
# "modo": "evaluacion", and it calls POST /paso over HTTP (PASO_URL, PASO_KEY below).
#
# Run `npm run build:simulador` first: archive_file zips tools/simulador/dist/lambda.js.
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

# Least privilege: its own log group and only the writes DynamoPersistencia makes
# (lock, metadata and turns through TransactWriteItems). No reads, no Scan.
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
  memory_size      = 1024 # evaluation rounds send up to 200 requests at once; more CPU keeps the client from adding delay
  timeout          = 900  # a round lasts 5 minutes; 15 minutes is the Lambda ceiling
  role             = aws_iam_role.simulador.arn
  filename         = data.archive_file.simulador.output_path
  source_code_hash = data.archive_file.simulador.output_base64sha256

  environment {
    variables = {
      MUNDO_TABLE = aws_dynamodb_table.main.name
      # Evaluation rounds call POST /paso over HTTP from this region, straight to API Gateway
      # (no CloudFront hop), so the measured p95 is the service's and not the operator's internet.
      PASO_URL = "${aws_apigatewayv2_api.api.api_endpoint}/api/paso"
      # Same sensitive variable the API Lambda already receives (TF_VAR_api_key, never committed).
      PASO_KEY = var.api_key
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.simulador,
    aws_iam_role_policy.simulador,
  ]
}

# A failed demo round is never retried: the next schedule starts a fresh one.
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

    # Confused-deputy protection: only schedules of this account can assume it.
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
