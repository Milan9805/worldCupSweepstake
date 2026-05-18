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

variable "football_data_api_key" {
  type      = string
  sensitive = true
}

variable "jwt_secret" {
  type      = string
  sensitive = true
}

variable "alert_email" {
  type        = string
  description = "Email address for AWS budget alerts"
}
