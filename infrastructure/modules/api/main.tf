variable "environment" {
  type = string
}

variable "table_prefix" {
  type = string
}

variable "avatar_bucket_arn" {
  type = string
}

variable "avatar_bucket_name" {
  type = string
}

variable "dynamodb_table_arns" {
  type = list(string)
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
  type    = string
  default = ""
}

# IAM Role for Lambda
resource "aws_iam_role" "lambda" {
  name = "sweepstake-${var.environment}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda_dynamodb" {
  name = "dynamodb-access"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Scan",
          "dynamodb:Query"
        ]
        Resource = var.dynamodb_table_arns
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda_s3" {
  name = "s3-avatar-access"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject"
        ]
        Resource = "${var.avatar_bucket_arn}/*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_logs" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# API Gateway
resource "aws_apigatewayv2_api" "api" {
  name          = "sweepstake-${var.environment}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_headers = ["Content-Type", "Authorization"]
    allow_methods = ["GET", "POST", "PUT", "OPTIONS"]
    allow_origins = ["*"]
  }
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 10
    throttling_rate_limit  = 5
  }
}

# Lambda functions would be defined here for each handler
# Using a single Lambda with routing for simplicity

resource "aws_lambda_function" "api" {
  filename                       = "${path.module}/lambda.zip"
  function_name                  = "sweepstake-${var.environment}-api"
  role                           = aws_iam_role.lambda.arn
  handler                        = "index.handler"
  runtime                        = "nodejs20.x"
  timeout                        = 30
  memory_size                    = 256
  reserved_concurrent_executions = 5

  environment {
    variables = {
      TABLE_PREFIX          = var.table_prefix
      AVATAR_BUCKET         = var.avatar_bucket_name
      FOOTBALL_DATA_API_KEY = var.football_data_api_key
      JWT_SECRET            = var.jwt_secret
    }
  }

  tags = {
    Environment = var.environment
    Project     = "sweepstake"
  }
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "catch_all" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# CloudWatch Alarms

resource "aws_sns_topic" "alerts" {
  name = "sweepstake-${var.environment}-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alert_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "sweepstake-${var.environment}-lambda-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "Lambda function errors exceeded threshold"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    FunctionName = aws_lambda_function.api.function_name
  }

  tags = {
    Environment = var.environment
    Project     = "sweepstake"
  }
}

resource "aws_cloudwatch_metric_alarm" "lambda_throttles" {
  alarm_name          = "sweepstake-${var.environment}-lambda-throttles"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Throttles"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 3
  alarm_description   = "Lambda function is being throttled"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    FunctionName = aws_lambda_function.api.function_name
  }

  tags = {
    Environment = var.environment
    Project     = "sweepstake"
  }
}

resource "aws_cloudwatch_metric_alarm" "lambda_duration" {
  alarm_name          = "sweepstake-${var.environment}-lambda-duration"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Average"
  threshold           = 10000
  alarm_description   = "Lambda average duration exceeding 10s"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    FunctionName = aws_lambda_function.api.function_name
  }

  tags = {
    Environment = var.environment
    Project     = "sweepstake"
  }
}

resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "sweepstake-${var.environment}-api-5xx"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "5xx"
  namespace           = "AWS/ApiGateway"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "API Gateway 5xx errors exceeded threshold"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    ApiId = aws_apigatewayv2_api.api.id
  }

  tags = {
    Environment = var.environment
    Project     = "sweepstake"
  }
}

resource "aws_cloudwatch_metric_alarm" "lambda_invocations" {
  alarm_name          = "sweepstake-${var.environment}-lambda-invocations"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Invocations"
  namespace           = "AWS/Lambda"
  period              = 3600
  statistic           = "Sum"
  threshold           = 1000
  alarm_description   = "Lambda invocations unusually high (potential abuse)"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    FunctionName = aws_lambda_function.api.function_name
  }

  tags = {
    Environment = var.environment
    Project     = "sweepstake"
  }
}

output "api_url" {
  value = aws_apigatewayv2_stage.default.invoke_url
}

output "alerts_topic_arn" {
  value = aws_sns_topic.alerts.arn
}
