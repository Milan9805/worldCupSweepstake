variable "environment" {
  type = string
}

variable "table_prefix" {
  type = string
}

resource "aws_dynamodb_table" "groups" {
  name         = "${var.table_prefix}Groups"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "groupKey"

  attribute {
    name = "groupKey"
    type = "S"
  }

  tags = {
    Environment = var.environment
    Project     = "sweepstake"
  }
}

resource "aws_dynamodb_table" "matches" {
  name         = "${var.table_prefix}Matches"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "matchId"

  attribute {
    name = "matchId"
    type = "S"
  }

  tags = {
    Environment = var.environment
    Project     = "sweepstake"
  }
}

resource "aws_dynamodb_table" "teams" {
  name         = "${var.table_prefix}Teams"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "teamCode"

  attribute {
    name = "teamCode"
    type = "S"
  }

  tags = {
    Environment = var.environment
    Project     = "sweepstake"
  }
}

resource "aws_dynamodb_table" "bracket" {
  name         = "${var.table_prefix}TournamentBracket"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "round"
  range_key    = "position"

  attribute {
    name = "round"
    type = "S"
  }

  attribute {
    name = "position"
    type = "N"
  }

  tags = {
    Environment = var.environment
    Project     = "sweepstake"
  }
}

resource "aws_dynamodb_table" "config" {
  name         = "${var.table_prefix}Config"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "configKey"

  attribute {
    name = "configKey"
    type = "S"
  }

  tags = {
    Environment = var.environment
    Project     = "sweepstake"
  }
}

output "table_arns" {
  value = [
    aws_dynamodb_table.groups.arn,
    aws_dynamodb_table.matches.arn,
    aws_dynamodb_table.teams.arn,
    aws_dynamodb_table.bracket.arn,
    aws_dynamodb_table.config.arn,
  ]
}
