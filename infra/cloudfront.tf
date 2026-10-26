# One distribution, one domain:
#   /            -> S3 static export (frontend/out)
#   /api/*       -> API Gateway, never cached (/paso and /estado change every turn)
# Same origin for site and API, so the browser needs no CORS in production.

locals {
  s3_origin_id  = "site-s3"
  api_origin_id = "api-gateway"
  api_domain    = replace(aws_apigatewayv2_api.api.api_endpoint, "https://", "")
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  # Static site only; the API behavior uses caching_disabled.
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

# API Gateway rejects requests whose Host header is the CloudFront domain.
data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${local.name_prefix}-site-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# The static export writes /mapa as mapa.html. Map clean URLs to files:
#   / -> /index.html, /mapa -> /mapa.html, /mapa/ -> /mapa.html
resource "aws_cloudfront_function" "rewrite_html" {
  name    = "${local.name_prefix}-rewrite-html"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      var uri = request.uri;
      if (uri === '/') {
        request.uri = '/index.html';
        return request;
      }
      if (uri.endsWith('/')) {
        uri = uri.slice(0, -1);
      }
      if (uri.lastIndexOf('.') < uri.lastIndexOf('/') + 1) {
        request.uri = uri + '.html';
      }
      return request;
    }
  EOT
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
