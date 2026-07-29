variable "prefix" {
  type        = string
  description = "Account-independent resource-name prefix."
  default     = "insurance-ai"
}

variable "location" {
  type        = string
  description = "Target Azure region selected at deployment time."
}

variable "profile" {
  type        = string
  description = "Economy uses minimal capacity; parity preserves the observed higher-capacity topology."
  default     = "economy"

  validation {
    condition     = contains(["economy", "parity"], var.profile)
    error_message = "profile must be economy or parity."
  }
}

variable "container_image" {
  type        = string
  description = "Backend image published by the deployment pipeline."
  default     = "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest"
}

variable "apim_publisher_email" {
  type        = string
  description = "Required APIM publisher email; do not use an observed deployment value."
}

variable "apim_publisher_name" {
  type    = string
  default = "Insurance AI"
}

variable "openai_model" {
  type    = string
  default = "gpt-4o"
}

variable "openai_model_version" {
  type    = string
  default = "2024-11-20"
}

variable "frontend_urls" {
  type        = list(string)
  description = "Customer and operator dashboard origins allowed by the API CORS policy."
  default     = []
}

variable "auth_tenant_id" { type = string }
variable "auth_client_id" { type = string }
