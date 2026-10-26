# Run `npm run build -w backend` first: archive_file zips backend/dist/handler.js.
data "archive_file" "api" {
  type        = "zip"
  source_file = "${path.module}/../backend/dist/handler.js"
  output_path = "${path.module}/build/api.zip"
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.name_prefix}-lambda-api"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "api" {
  function_name    = "${local.name_prefix}-lambda-api"
  runtime          = "nodejs24.x"
  handler          = "handler.handler"
  architectures    = ["arm64"]
  memory_size      = var.lambda_memory_mb
  timeout          = 10
  role             = aws_iam_role.lambda.arn
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256

  environment {
    variables = {
      DDB_TABLE  = aws_dynamodb_table.main.name
      CACHE_IMPL = var.enable_valkey ? "valkey" : "noop"
      LOG_LEVEL  = var.log_level
      STAGE      = var.env
      API_KEY    = var.api_key
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.api,
    aws_iam_role_policy.lambda_api,
  ]
}
