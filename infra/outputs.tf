output "site_url" {
  description = "Public URL of the site (frontend + /api)."
  value       = "https://${aws_cloudfront_distribution.main.domain_name}"
}

output "cloudfront_domain" {
  value = aws_cloudfront_distribution.main.domain_name
}

output "cloudfront_id" {
  description = "Used by `aws cloudfront create-invalidation`."
  value       = aws_cloudfront_distribution.main.id
}

output "bucket_name" {
  description = "Target of `aws s3 sync frontend/out`."
  value       = aws_s3_bucket.site.bucket
}

output "api_url" {
  description = "Direct API Gateway URL (bypasses CloudFront). Useful for local dev and debugging."
  value       = aws_apigatewayv2_api.api.api_endpoint
}

output "table_name" {
  value = aws_dynamodb_table.main.name
}

output "lambda_name" {
  value = aws_lambda_function.api.function_name
}
