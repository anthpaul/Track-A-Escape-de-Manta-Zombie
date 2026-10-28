data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${local.name_prefix}-lambda-api-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

# Mínimo privilegio: solo el log group de la API y solo las operaciones que
# necesitan los patrones de acceso. Scan no se concede a propósito (AGENTS.md sección 4).
data "aws_iam_policy_document" "lambda_api" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.api.arn}:*"]
  }

  statement {
    sid = "DynamoTable"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:ConditionCheckItem",
      "dynamodb:BatchGetItem",
    ]
    resources = [
      aws_dynamodb_table.main.arn,
      "${aws_dynamodb_table.main.arn}/index/*",
    ]
  }
}

resource "aws_iam_role_policy" "lambda_api" {
  name   = "${local.name_prefix}-lambda-api-policy"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda_api.json
}
