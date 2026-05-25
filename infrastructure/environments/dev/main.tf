terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

module "database" {
  source = "../../modules/database"
  
  environment  = var.environment
  table_prefix = var.table_prefix
}

module "frontend" {
  source = "../../modules/frontend"
  
  environment    = var.environment
  domain_name    = var.domain_name
  bucket_prefix  = var.bucket_prefix
}

module "api" {
  source = "../../modules/api"

  environment                    = var.environment
  table_prefix                   = var.table_prefix
  avatar_bucket_arn              = module.frontend.avatar_bucket_arn
  avatar_bucket_name             = module.frontend.avatar_bucket_name
  dynamodb_table_arns            = module.database.table_arns
  jwt_secret_ssm_name            = var.jwt_secret_ssm_name
  football_data_api_key_ssm_name = var.football_data_api_key_ssm_name
  alert_email                    = var.alert_email
}

module "budget" {
  source = "../../modules/budget"

  environment  = var.environment
  budget_limit = "5"
  alert_email  = var.alert_email
}
