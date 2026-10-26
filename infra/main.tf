terraform {
  required_version = "~> 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.21"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }

  # Bucket created by infra/bootstrap. Its name holds the account id, so bucket
  # and region come from the gitignored backend.hcl: terraform init -backend-config=backend.hcl
  # Locking uses an S3 lockfile (use_lockfile), so no DynamoDB lock table is needed.
  backend "s3" {
    key          = "spookython/terraform.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = var.project
      Env       = var.env
      ManagedBy = "terraform"
    }
  }
}

locals {
  name_prefix = "${var.project}-${var.env}"
}
