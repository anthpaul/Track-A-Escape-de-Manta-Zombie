variable "project" {
  description = "Project name, used as the prefix of every resource name."
  type        = string
  default     = "spookython"
}

variable "env" {
  description = "Environment name (part of every resource name)."
  type        = string
  default     = "prod"
}

variable "aws_region" {
  description = "AWS region of the team account. us-east-1 only if the organization requires it (AGENTS.md Q1)."
  type        = string
  default     = "us-east-2"

  validation {
    condition     = contains(["us-east-1", "us-east-2"], var.aws_region)
    error_message = "Only us-east-1 or us-east-2 are allowed (see AGENTS.md section 1). Discuss with the team before changing it."
  }
}

variable "table_name" {
  description = "DynamoDB single-table name."
  type        = string
  default     = "spookython_mundo"
}

variable "enable_valkey" {
  description = "Create the ElastiCache Valkey cluster. Off by default because it bills from minute one."
  type        = bool
  default     = false
}

variable "lambda_memory_mb" {
  description = "API Lambda memory. 1024 MB gives more CPU: faster A* and shorter cold starts (AGENTS.md section 6)."
  type        = number
  default     = 1024
}

variable "api_key" {
  description = "Value expected in the x-api-key header of POST /api/paso. Set it with TF_VAR_api_key, never in a committed file."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.api_key) >= 32
    error_message = "api_key must be at least 32 characters."
  }
}

variable "log_level" {
  description = "LOG_LEVEL passed to the Lambda."
  type        = string
  default     = "info"
}

variable "log_retention_days" {
  description = "CloudWatch log retention for the API Lambda."
  type        = number
  default     = 7
}

variable "cors_allow_origins" {
  description = "Origins allowed to call the API Gateway URL directly (local dev). The CloudFront site calls /api on its own domain and needs no CORS."
  type        = list(string)
  default     = ["http://localhost:3000"]
}

variable "api_throttle_rate" {
  description = "Steady-state requests per second allowed by the API stage (budget protection)."
  type        = number
  default     = 300
}

variable "api_throttle_burst" {
  description = "Burst requests allowed by the API stage."
  type        = number
  default     = 600
}
