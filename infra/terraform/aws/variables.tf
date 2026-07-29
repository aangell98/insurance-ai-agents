variable "prefix" {
  type        = string
  description = "Account-independent resource-name prefix."
  default     = "insurance-ai"
}

variable "region" {
  type        = string
  description = "Target AWS region selected at deployment time."
}

variable "profile" {
  type        = string
  description = "Economy uses short log retention; parity retains evidence for longer."
  default     = "economy"

  validation {
    condition     = contains(["economy", "parity"], var.profile)
    error_message = "profile must be economy or parity."
  }
}

variable "container_image" {
  type        = string
  description = "Container image URI selected by the deployment pipeline."
}

variable "bedrock_model_id" {
  type        = string
  description = "Bedrock model identifier enabled in the target account."
  default     = "anthropic.claude-3-5-sonnet-20241022-v2:0"
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "Existing private subnet IDs for the account-agnostic ECS service."
}

variable "ecs_security_group_ids" {
  type        = list(string)
  description = "Existing security group IDs for the ECS service."
}

variable "public_alb_subnet_ids" {
  type        = list(string)
  description = "Public subnet IDs for the internet-facing ALB."
}

variable "alb_security_group_ids" {
  type        = list(string)
  description = "Security group IDs for the public ALB."
}

variable "vpc_id" {
  type        = string
  description = "Existing VPC ID hosting the ALB and ECS service."
}

variable "certificate_arn" {
  type        = string
  description = "ACM certificate ARN for the stable HTTPS ALB listener."
}

variable "route53_zone_id" {
  type        = string
  description = "Route53 hosted zone containing custom_api_hostname."
}

variable "custom_api_hostname" {
  type        = string
  description = "Hostname covered by certificate_arn and aliased to the ALB."
}

variable "auth_tenant_id" { type = string }
variable "auth_client_id" { type = string }
variable "frontend_urls" {
  type        = list(string)
  description = "Browser origins allowed by backend CORS."
}
