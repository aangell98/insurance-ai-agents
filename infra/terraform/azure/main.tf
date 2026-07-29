locals {
  suffix = substr(md5("${var.prefix}-${var.location}"), 0, 6)
  name   = "${var.prefix}-${local.suffix}"
}

resource "azurerm_resource_group" "this" {
  name     = "rg-${local.name}"
  location = var.location
}

resource "azurerm_log_analytics_workspace" "this" {
  name                = "${local.name}-law"
  location            = var.location
  resource_group_name = azurerm_resource_group.this.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

resource "azurerm_application_insights" "this" {
  name                = "${local.name}-appi"
  location            = var.location
  resource_group_name = azurerm_resource_group.this.name
  workspace_id        = azurerm_log_analytics_workspace.this.id
  application_type    = "web"
}

resource "azurerm_container_registry" "this" {
  name                = replace("${var.prefix}${local.suffix}acr", "-", "")
  resource_group_name = azurerm_resource_group.this.name
  location            = var.location
  sku                 = var.profile == "parity" ? "Standard" : "Basic"
  admin_enabled       = false
}

resource "azurerm_user_assigned_identity" "backend" {
  name                = "${local.name}-backend-mi"
  location            = var.location
  resource_group_name = azurerm_resource_group.this.name
}

resource "azurerm_container_app_environment" "this" {
  name                       = "${local.name}-cae"
  location                   = var.location
  resource_group_name        = azurerm_resource_group.this.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.this.id
}

resource "azurerm_container_app" "backend" {
  name                         = "${local.name}-api"
  resource_group_name          = azurerm_resource_group.this.name
  container_app_environment_id = azurerm_container_app_environment.this.id
  revision_mode                = "Single"

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.backend.id]
  }

  registry {
    server   = azurerm_container_registry.this.login_server
    identity = azurerm_user_assigned_identity.backend.id
  }

  secret {
    name  = "apim-subscription-key"
    value = azurerm_api_management_subscription.backend.primary_key
  }

  template {
    min_replicas = var.profile == "parity" ? 1 : 0
    max_replicas = 1

    container {
      name   = "api"
      image  = var.container_image
      cpu    = var.profile == "parity" ? 1.0 : 0.25
      memory = var.profile == "parity" ? "2Gi" : "0.5Gi"

      env {
        name  = "AZURE_AUTH_MODE"
        value = "managed_identity"
      }

      env {
        name  = "AUTH_ENABLED"
        value = "true"
      }

      env {
        name  = "AUTH_TENANT_ID"
        value = var.auth_tenant_id
      }

      env {
        name  = "AUTH_CLIENT_ID"
        value = var.auth_client_id
      }

      env {
        name  = "AZURE_CLIENT_ID"
        value = azurerm_user_assigned_identity.backend.client_id
      }

      env {
        name  = "AZURE_OPENAI_ENDPOINT"
        value = azurerm_cognitive_account.openai.endpoint
      }
      env {
        name  = "AZURE_OPENAI_DEPLOYMENT"
        value = var.openai_model
      }

      env {
        name  = "COSMOS_ENDPOINT"
        value = azurerm_cosmosdb_account.this.endpoint
      }
      env {
        name  = "COSMOS_DATABASE"
        value = azurerm_cosmosdb_sql_database.claims.name
      }
      env {
        name  = "COSMOS_CONTAINER"
        value = azurerm_cosmosdb_sql_container.claims.name
      }
      env {
        name  = "COSMOS_STATE_CONTAINER"
        value = azurerm_cosmosdb_sql_container.demo_state.name
      }

      env {
        name  = "STATE_BACKEND"
        value = "cosmos"
      }
      env {
        name  = "EVIDENCE_BACKEND"
        value = "blob"
      }
      env {
        name  = "BLOB_ENDPOINT"
        value = azurerm_storage_account.evidence.primary_blob_endpoint
      }
      env {
        name  = "BLOB_CONTAINER"
        value = azurerm_storage_container.evidence.name
      }

      env {
        name  = "APIM_GATEWAY_URL"
        value = azurerm_api_management.this.gateway_url
      }

      env {
        name        = "APIM_SUBSCRIPTION_KEY"
        secret_name = "apim-subscription-key"
      }

      env {
        name  = "LLM_PROVIDER"
        value = "azure_apim"
      }

      env {
        name  = "FRONTEND_URLS"
        value = join(",", var.frontend_urls)
      }
    }

  }

  ingress {
    external_enabled = true
    target_port      = 8000

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }
}

resource "azurerm_role_assignment" "backend_acr_pull" {
  scope                = azurerm_container_registry.this.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.backend.principal_id
}

resource "azurerm_cosmosdb_account" "this" {
  name                             = "${local.name}-cosmos"
  location                         = var.location
  resource_group_name              = azurerm_resource_group.this.name
  offer_type                       = "Standard"
  kind                             = "GlobalDocumentDB"
  local_authentication_enabled     = false
  public_network_access_enabled    = true
  automatic_failover_enabled       = false
  multiple_write_locations_enabled = false

  consistency_policy {
    consistency_level = "Session"
  }

  geo_location {
    location          = var.location
    failover_priority = 0
  }
}

resource "azurerm_cosmosdb_sql_database" "claims" {
  name                = "insurance-claims"
  resource_group_name = azurerm_resource_group.this.name
  account_name        = azurerm_cosmosdb_account.this.name
}

resource "azurerm_cosmosdb_sql_container" "claims" {
  name                = "claims"
  resource_group_name = azurerm_resource_group.this.name
  account_name        = azurerm_cosmosdb_account.this.name
  database_name       = azurerm_cosmosdb_sql_database.claims.name
  partition_key_paths = ["/customer_id"]
}

resource "azurerm_cosmosdb_sql_container" "demo_state" {
  name                = "demo-state"
  resource_group_name = azurerm_resource_group.this.name
  account_name        = azurerm_cosmosdb_account.this.name
  database_name       = azurerm_cosmosdb_sql_database.claims.name
  partition_key_paths = ["/customer_id"]
}

resource "azurerm_storage_account" "evidence" {
  name                     = substr(replace("${local.name}evidence", "-", ""), 0, 24)
  resource_group_name      = azurerm_resource_group.this.name
  location                 = azurerm_resource_group.this.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_2"
}

resource "azurerm_storage_container" "evidence" {
  name                  = "evidence"
  storage_account_id    = azurerm_storage_account.evidence.id
  container_access_type = "private"
}

resource "azurerm_role_assignment" "backend_evidence_contributor" {
  scope                = "${azurerm_storage_account.evidence.id}/blobServices/default/containers/${azurerm_storage_container.evidence.name}"
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.backend.principal_id
}

resource "azurerm_cosmosdb_sql_role_assignment" "backend_data_contributor" {
  resource_group_name = azurerm_resource_group.this.name
  account_name        = azurerm_cosmosdb_account.this.name
  role_definition_id  = "${azurerm_cosmosdb_account.this.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002"
  principal_id        = azurerm_user_assigned_identity.backend.principal_id
  scope               = "${azurerm_cosmosdb_account.this.id}/dbs/${azurerm_cosmosdb_sql_database.claims.name}"
}

resource "azurerm_cognitive_account" "openai" {
  name                  = "${local.name}-aoai"
  location              = var.location
  resource_group_name   = azurerm_resource_group.this.name
  kind                  = "OpenAI"
  sku_name              = "S0"
  custom_subdomain_name = "${local.name}-aoai"
}

resource "azurerm_cognitive_deployment" "gpt" {
  name                 = var.openai_model
  cognitive_account_id = azurerm_cognitive_account.openai.id

  model {
    format  = "OpenAI"
    name    = var.openai_model
    version = var.openai_model_version
  }

  sku {
    name     = "GlobalStandard"
    capacity = var.profile == "parity" ? 30 : 1
  }
}

resource "azurerm_cognitive_account" "safety" {
  name                  = "${local.name}-safety"
  location              = var.location
  resource_group_name   = azurerm_resource_group.this.name
  kind                  = "ContentSafety"
  sku_name              = "S0"
  custom_subdomain_name = "${local.name}-safety"
}

resource "azurerm_api_management" "this" {
  name                = "${local.name}-apim"
  location            = var.location
  resource_group_name = azurerm_resource_group.this.name
  publisher_name      = var.apim_publisher_name
  publisher_email     = var.apim_publisher_email
  sku_name            = var.profile == "parity" ? "StandardV2_1" : "BasicV2_1"

  identity {
    type = "SystemAssigned"
  }
}

resource "azurerm_api_management_backend" "openai" {
  name                = "openai-backend"
  resource_group_name = azurerm_resource_group.this.name
  api_management_name = azurerm_api_management.this.name
  protocol            = "http"
  url                 = azurerm_cognitive_account.openai.endpoint
}

resource "azurerm_api_management_backend" "content_safety" {
  name                = "contentsafety-backend"
  resource_group_name = azurerm_resource_group.this.name
  api_management_name = azurerm_api_management.this.name
  protocol            = "http"
  url                 = azurerm_cognitive_account.safety.endpoint
}

resource "azurerm_api_management_api" "openai" {
  name                = "azure-openai"
  resource_group_name = azurerm_resource_group.this.name
  api_management_name = azurerm_api_management.this.name
  revision            = "1"
  display_name        = "Azure OpenAI (governed)"
  path                = "openai-gov"
  protocols           = ["https"]
  service_url         = azurerm_cognitive_account.openai.endpoint
}

resource "azurerm_api_management_api_operation" "openai_passthrough" {
  operation_id        = "openai-passthrough"
  api_name            = azurerm_api_management_api.openai.name
  api_management_name = azurerm_api_management.this.name
  resource_group_name = azurerm_resource_group.this.name
  display_name        = "Azure OpenAI passthrough"
  method              = "POST"
  url_template        = "/*"
}

resource "azurerm_api_management_api_policy" "openai" {
  api_name            = azurerm_api_management_api.openai.name
  api_management_name = azurerm_api_management.this.name
  resource_group_name = azurerm_resource_group.this.name
  xml_content         = file("${path.module}/../../apim-policy.xml")
}

resource "azurerm_api_management_product" "agents" {
  product_id            = "insurance-agents"
  api_management_name   = azurerm_api_management.this.name
  resource_group_name   = azurerm_resource_group.this.name
  display_name          = "Insurance AI Agents"
  subscription_required = true
  approval_required     = false
  published             = true
}

resource "azurerm_api_management_product_api" "openai" {
  api_name            = azurerm_api_management_api.openai.name
  product_id          = azurerm_api_management_product.agents.product_id
  api_management_name = azurerm_api_management.this.name
  resource_group_name = azurerm_resource_group.this.name
}

resource "azurerm_api_management_subscription" "backend" {
  api_management_name = azurerm_api_management.this.name
  resource_group_name = azurerm_resource_group.this.name
  display_name        = "Backend agent runtime"
  product_id          = azurerm_api_management_product.agents.id
  state               = "active"
}

resource "azurerm_role_assignment" "apim_openai_user" {
  scope                = azurerm_cognitive_account.openai.id
  role_definition_name = "Cognitive Services OpenAI User"
  principal_id         = azurerm_api_management.this.identity[0].principal_id
}

resource "azurerm_role_assignment" "apim_safety_user" {
  scope                = azurerm_cognitive_account.safety.id
  role_definition_name = "Cognitive Services User"
  principal_id         = azurerm_api_management.this.identity[0].principal_id
}

output "backend_url" {
  value       = azurerm_container_app.backend.ingress[0].fqdn
  description = "Container Apps backend FQDN."
}
