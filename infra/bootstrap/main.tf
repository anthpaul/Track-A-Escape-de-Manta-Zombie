# One-time setup: creates the S3 bucket that stores the shared Terraform state
# for infra/. Run once per AWS account, before the first `terraform init` in infra/.
# This folder keeps its own state locally (terraform.tfstate here, gitignored).

terraform {
  required_version = "~> 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.21"
    }
  }
}

variable "aws_region" {
  description = "Region of the state bucket. Use the same one as infra/variables.tf."
  type        = string
  default     = "us-east-2"
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = "spookython"
      ManagedBy = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "tfstate" {
  bucket = "spookython-tfstate-${data.aws_caller_identity.current.account_id}"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

output "state_bucket" {
  description = "Paste this value into infra/backend.hcl."
  value       = aws_s3_bucket.tfstate.bucket
}
