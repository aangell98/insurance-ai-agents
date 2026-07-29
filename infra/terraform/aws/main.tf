data "aws_caller_identity" "current" {}

locals {
  name = "${var.prefix}-${substr(md5(data.aws_caller_identity.current.account_id), 0, 6)}"
}

resource "aws_ecr_repository" "api" {
  name = "${local.name}-api"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/insurance-ai/${local.name}"
  retention_in_days = var.profile == "parity" ? 30 : 7
}

resource "aws_iam_role" "task" {
  name = "${local.name}-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "bedrock" {
  name = "bedrock-invoke"
  role = aws_iam_role.task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["bedrock:InvokeModel", "bedrock:Converse"]
      Resource = "*"
    }]
  })
}

resource "aws_iam_role_policy" "claims_state" {
  name = "claims-state"
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan"]
      Resource = [
        aws_dynamodb_table.state.arn,
        "${aws_dynamodb_table.state.arn}/index/customer_id-index",
        "${aws_dynamodb_table.state.arn}/index/decision-index",
        aws_dynamodb_table.demo_state.arn,
      ]
    }]
  })
}

resource "aws_iam_role_policy" "evidence" {
  name = "evidence-store"
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
      Resource = "${aws_s3_bucket.exports.arn}/evidence/*"
    }]
  })
}

resource "aws_iam_role" "execution" {
  name = "${local.name}-execution"

  assume_role_policy = aws_iam_role.task.assume_role_policy
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_ecs_cluster" "this" {
  name = "${local.name}-cluster"
}

resource "aws_lb" "api" {
  name               = "${local.name}-api"
  internal           = false
  load_balancer_type = "application"
  security_groups    = var.alb_security_group_ids
  subnets            = var.public_alb_subnet_ids
}

resource "aws_lb_target_group" "api" {
  name        = "${local.name}-api"
  port        = 8000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc_id

  health_check {
    path = "/api/health"
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

}

resource "aws_route53_record" "api" {
  zone_id = var.route53_zone_id
  name    = var.custom_api_hostname
  type    = "A"

  alias {
    name                   = aws_lb.api.dns_name
    zone_id                = aws_lb.api.zone_id
    evaluate_target_health = true
  }
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "${local.name}-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.profile == "parity" ? "1024" : "256"
  memory                   = var.profile == "parity" ? "2048" : "512"
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name         = "api"
    image        = var.container_image
    essential    = true
    portMappings = [{ containerPort = 8000 }]
    environment = [
      { name = "LLM_PROVIDER", value = "bedrock" },
      { name = "AWS_REGION", value = var.region },
      { name = "BEDROCK_MODEL_ID", value = var.bedrock_model_id },
      { name = "STATE_BACKEND", value = "dynamodb" },
      { name = "DYNAMODB_TABLE", value = aws_dynamodb_table.state.name },
      { name = "DYNAMODB_STATE_TABLE", value = aws_dynamodb_table.demo_state.name }
      , { name = "EVIDENCE_BACKEND", value = "s3" }
      , { name = "EVIDENCE_BUCKET", value = aws_s3_bucket.exports.id }
      , { name = "AUTH_ENABLED", value = "true" }
      , { name = "AUTH_TENANT_ID", value = var.auth_tenant_id }
      , { name = "AUTH_CLIENT_ID", value = var.auth_client_id }
      , { name = "FRONTEND_URLS", value = join(",", var.frontend_urls) }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.api.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "api"
      }

    }
  }])
}

resource "aws_ecs_service" "backend" {
  name            = "${local.name}-backend"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = var.ecs_security_group_ids
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 8000
  }

  depends_on = [aws_lb_listener.https]
}

resource "aws_s3_bucket" "exports" {
  bucket_prefix = "${local.name}-exports-"
}

resource "aws_dynamodb_table" "state" {
  name         = "${local.name}-state"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "claim_id"

  attribute {
    name = "claim_id"
    type = "S"
  }

  attribute {
    name = "customer_id"
    type = "S"
  }

  attribute {
    name = "decision"
    type = "S"
  }
  attribute {
    name = "timestamp"
    type = "S"
  }

  global_secondary_index {
    name            = "customer_id-index"
    hash_key        = "customer_id"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "decision-index"
    hash_key        = "decision"
    range_key       = "timestamp"
    projection_type = "ALL"
  }
}

resource "aws_dynamodb_table" "demo_state" {
  name         = "${local.name}-demo-state"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "claim_id"
  attribute {
    name = "claim_id"
    type = "S"
  }
}

output "ecr_repository_url" {
  value       = aws_ecr_repository.api.repository_url
  description = "Target repository for the backend image."
}

output "api_https_url" {
  value       = "https://${var.custom_api_hostname}"
  description = "Stable custom HTTPS hostname; certificate_arn must cover it."
}
