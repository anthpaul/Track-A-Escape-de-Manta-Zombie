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

  # Bucket creado por infra/bootstrap. Su nombre contiene el account id, por eso el bucket
  # y la región salen de backend.hcl (en .gitignore): terraform init -backend-config=backend.hcl
  # El bloqueo usa un lockfile en S3 (use_lockfile), así que no hace falta una tabla de bloqueo en DynamoDB.
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
