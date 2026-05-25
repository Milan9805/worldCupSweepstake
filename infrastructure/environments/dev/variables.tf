variable "aws_region" {
  type    = string
  default = "eu-west-2"
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "table_prefix" {
  type    = string
  default = "sweepstake-dev-"
}

variable "bucket_prefix" {
  type    = string
  default = "sweepstake-dev"
}

variable "domain_name" {
  type    = string
  default = ""
}

variable "jwt_secret_ssm_name" {
  type        = string
  description = "SSM SecureString parameter name holding the JWT signing secret"
  default     = "/sweepstake/dev/jwt_secret"
}

variable "football_data_api_key_ssm_name" {
  type        = string
  description = "SSM SecureString parameter name holding the football-data.org API key"
  default     = "/sweepstake/dev/football_data_api_key"
}

variable "alert_email" {
  type        = string
  description = "Email address for AWS budget alerts"
}
