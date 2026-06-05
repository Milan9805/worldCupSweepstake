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

  # Guard against accidental data loss: Terraform will hard-error rather than
  # destroy/replace this table (which would wipe its data).
  lifecycle {
    prevent_destroy = true
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

  lifecycle {
    prevent_destroy = true
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

  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Environment = var.environment
    Project     = "sweepstake"
  }
}

resource "aws_dynamodb_table" "bracket" {
  name         = "${var.table_prefix}TournamentTree"
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

  lifecycle {
    prevent_destroy = true
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

  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Environment = var.environment
    Project     = "sweepstake"
  }
}

resource "aws_dynamodb_table" "events" {
  name         = "${var.table_prefix}Events"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "feedId"
  range_key    = "sk"

  attribute {
    name = "feedId"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  lifecycle {
    prevent_destroy = true
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
    aws_dynamodb_table.events.arn,
  ]
}
