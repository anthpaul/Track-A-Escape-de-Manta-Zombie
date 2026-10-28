# Una distribución, un dominio:
#   /            -> export estático en S3 (frontend/out)
#   /api/*       -> API Gateway, nunca en caché (/paso y /estado cambian en cada turno)
# El sitio y la API comparten origen, así que el navegador no necesita CORS en producción.

locals {
  s3_origin_id  = "site-s3"
  api_origin_id = "api-gateway"
  api_domain    = replace(aws_apigatewayv2_api.api.api_endpoint, "https://", "")
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  # Solo para el sitio estático; el behavior de la API usa caching_disabled.
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

# API Gateway rechaza las solicitudes cuya cabecera Host es el dominio de CloudFront.
data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${local.name_prefix}-site-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# El export estático escribe /mapa como mapa.html. Se traducen las URL limpias a archivos:
#   / -> /index.html, /mapa -> /mapa.html, /mapa/ -> /mapa.html
resource "aws_cloudfront_function" "rewrite_html" {
  name    = "${local.name_prefix}-rewrite-html"
  runtime = "cloudfront-js-2.0"
  publish = true
  # Compartido con sus tests: node --test infra/functions/rewrite-html.test.mjs
  code = file("${path.module}/functions/rewrite-html.js")
}

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  comment             = "${local.name_prefix} site + api"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  http_version        = "http2and3"

  origin {
    origin_id                = local.s3_origin_id
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  origin {
    origin_id   = local.api_origin_id
    domain_name = local.api_domain

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = local.s3_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.rewrite_html.arn
    }
  }

  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = local.api_origin_id
    viewer_protocol_policy   = "https-only"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }

  custom_error_response {
    error_code         = 403
    response_code      = 404
    response_page_path = "/404.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 404
    response_page_path = "/404.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}
