// ============================================================================
// Insurance AI Agents Demo - Main Infrastructure
// ============================================================================
// Deploys: Azure OpenAI, APIM, Content Safety, ACR, Container Apps, 
//          Static Web Apps, Application Insights, AI Foundry Project
// ============================================================================

targetScope = 'resourceGroup'

@description('Base name for all resources')
@minLength(3)
param baseName string = 'ins-ai-demo'

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Azure OpenAI model deployment name')
param openAiModelName string = 'gpt-4o'

@description('Azure OpenAI model version')
param openAiModelVersion string = '2024-11-20'

@description('APIM publisher name')
param apimPublisherName string = 'Insurance AI Demo'

@description('APIM publisher email')
param apimPublisherEmail string = 'admin@insurance-ai-demo.com'

@description('Object ID of the principal (user or service principal) that should get Cosmos DB data-plane access. Leave empty to skip the role assignment.')
param cosmosDataPlanePrincipalId string = ''

@description('Public, non-secret container image used until a pipeline publishes the backend image to ACR.')
param backendImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
@description('Entra tenant ID required for externally exposed runtime authentication.')
param authTenantId string
@description('Entra API app client ID required for externally exposed runtime authentication.')
param authClientId string


// ============================================================================
// Variables
// ============================================================================

var uniqueSuffix = uniqueString(resourceGroup().id)
var openAiName = '${baseName}-aoai-${uniqueSuffix}'
var apimName = '${baseName}-apim-${uniqueSuffix}'
var contentSafetyName = '${baseName}-safety-${uniqueSuffix}'
var acrName = replace('${baseName}acr${uniqueSuffix}', '-', '')
var containerAppEnvName = '${baseName}-cae-${uniqueSuffix}'
var staticWebAppName = '${baseName}-swa-${uniqueSuffix}'
var appInsightsName = '${baseName}-ai-${uniqueSuffix}'
var logAnalyticsName = '${baseName}-law-${uniqueSuffix}'
var aiServicesName = '${baseName}-ais-${uniqueSuffix}'
var cosmosName = '${baseName}-cosmos-${uniqueSuffix}'
var evidenceStorageName = 'ev${uniqueSuffix}'

// ============================================================================
// Monitoring: Log Analytics + Application Insights
// ============================================================================

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// ============================================================================
// Azure OpenAI
// ============================================================================

resource openAi 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: openAiName
  location: location
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: openAiName
    publicNetworkAccess: 'Enabled'
  }
}

resource gpt4oDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: openAi
  name: openAiModelName
  sku: {
    name: 'GlobalStandard'
    capacity: 30
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: openAiModelName
      version: openAiModelVersion
    }
  }
}

resource embeddingsDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: openAi
  name: 'text-embedding-ada-002'
  sku: {
    name: 'Standard'
    capacity: 30
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'text-embedding-ada-002'
      version: '2'
    }
  }
  dependsOn: [gpt4oDeployment]
}

// ============================================================================
// Azure AI Services (Foundry-compatible)
// ============================================================================

resource aiServices 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: aiServicesName
  location: location
  kind: 'AIServices'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: aiServicesName
    publicNetworkAccess: 'Enabled'
  }
}

// ============================================================================
// Azure Content Safety
// ============================================================================

resource contentSafety 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: contentSafetyName
  location: location
  kind: 'ContentSafety'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: contentSafetyName
    publicNetworkAccess: 'Enabled'
  }
}

// ============================================================================
// Azure Container Registry
// ============================================================================

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: acrName
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
  }
}

// ============================================================================
// Azure API Management (AI Gateway)
// ============================================================================

resource apim 'Microsoft.ApiManagement/service@2023-09-01-preview' = {
  name: apimName
  location: location
  sku: {
    name: 'StandardV2'
    capacity: 1
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    publisherName: apimPublisherName
    publisherEmail: apimPublisherEmail
  }
}

// ============================================================================
// APIM → Azure OpenAI Backend
// ============================================================================

resource apimOpenAiBackend 'Microsoft.ApiManagement/service/backends@2023-09-01-preview' = {
  parent: apim
  name: 'openai-backend'
  properties: {
    protocol: 'http'
    url: openAi.properties.endpoint
    tls: {
      validateCertificateChain: true
      validateCertificateName: true
    }
  }
}

// ============================================================================
// APIM → Content Safety Backend
// ============================================================================

resource apimContentSafetyBackend 'Microsoft.ApiManagement/service/backends@2023-09-01-preview' = {
  parent: apim
  name: 'contentsafety-backend'
  properties: {
    protocol: 'http'
    url: contentSafety.properties.endpoint
    tls: {
      validateCertificateChain: true
      validateCertificateName: true
    }
  }
}

// ============================================================================
// APIM API: Azure OpenAI passthrough — agents call /openai/* on the gateway
// ============================================================================

resource apimOpenAiApi 'Microsoft.ApiManagement/service/apis@2023-09-01-preview' = {
  parent: apim
  name: 'azure-openai'
  properties: {
    displayName: 'Azure OpenAI (governed)'
    description: 'AI Gateway in front of Azure OpenAI: managed-identity auth, content safety, token rate-limit, audit log, token metrics.'
    path: 'openai-gov'
    protocols: ['https']
    serviceUrl: openAi.properties.endpoint
    subscriptionRequired: true
    apiType: 'http'
  }
}

// Single passthrough operation matching every Azure OpenAI route (deployments/{id}/chat/completions, etc.)
resource apimOpenAiOperation 'Microsoft.ApiManagement/service/apis/operations@2023-09-01-preview' = {
  parent: apimOpenAiApi
  name: 'openai-passthrough'
  properties: {
    displayName: 'Azure OpenAI passthrough'
    method: 'POST'
    urlTemplate: '/*'
  }
}

// Apply the AI Gateway policy XML (loaded from infra/apim-policy.xml)
resource apimOpenAiPolicy 'Microsoft.ApiManagement/service/apis/policies@2023-09-01-preview' = {
  parent: apimOpenAiApi
  name: 'policy'
  properties: {
    format: 'rawxml'
    value: loadTextContent('apim-policy.xml')
  }
}

// One subscription per agent → token-limit & metrics are sliced per agent
resource apimAgentProduct 'Microsoft.ApiManagement/service/products@2023-09-01-preview' = {
  parent: apim
  name: 'insurance-agents'
  properties: {
    displayName: 'Insurance AI Agents'
    description: 'Product that groups subscriptions for the multi-agent pipeline (intake, risk, compliance, orchestrator).'
    state: 'published'
    subscriptionRequired: true
    approvalRequired: false
  }
}

resource apimAgentProductApi 'Microsoft.ApiManagement/service/products/apis@2023-09-01-preview' = {
  parent: apimAgentProduct
  name: apimOpenAiApi.name
}

resource apimSubscriptionIntake 'Microsoft.ApiManagement/service/subscriptions@2023-09-01-preview' = {
  parent: apim
  name: 'sub-claims-intake'
  properties: {
    displayName: 'Claims Intake Agent'
    scope: '/products/insurance-agents'
    state: 'active'
  }
}

resource apimSubscriptionRisk 'Microsoft.ApiManagement/service/subscriptions@2023-09-01-preview' = {
  parent: apim
  name: 'sub-risk-assessment'
  properties: {
    displayName: 'Risk & Fraud Agent'
    scope: '/products/insurance-agents'
    state: 'active'
  }
}

resource apimSubscriptionCompliance 'Microsoft.ApiManagement/service/subscriptions@2023-09-01-preview' = {
  parent: apim
  name: 'sub-compliance'
  properties: {
    displayName: 'Compliance Agent'
    scope: '/products/insurance-agents'
    state: 'active'
  }
}

// ============================================================================
// RBAC: APIM → Cognitive Services User on Azure OpenAI
// ============================================================================

@description('Cognitive Services User role')
var cognitiveServicesUserRole = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'a97b65f3-24c7-4388-baec-2e87135dc908'
)
var acrPullRole = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '7f951dda-4ed3-4680-a7ca-43fe172d538d'
)

resource apimOpenAiRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: openAi
  name: guid(apim.id, openAi.id, cognitiveServicesUserRole)
  properties: {
    roleDefinitionId: cognitiveServicesUserRole
    principalId: apim.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource apimContentSafetyRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: contentSafety
  name: guid(apim.id, contentSafety.id, cognitiveServicesUserRole)
  properties: {
    roleDefinitionId: cognitiveServicesUserRole
    principalId: apim.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// ============================================================================
// Container Apps Environment (for backend API)
// ============================================================================

resource containerAppEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: containerAppEnvName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource backendIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${baseName}-backend-mi-${uniqueSuffix}'
  location: location
}

resource evidenceStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: evidenceStorageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource evidenceBlobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: evidenceStorage
  name: 'default'
}

resource evidenceContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: evidenceBlobService
  name: 'evidence'
  properties: {
    publicAccess: 'None'
  }
}

resource backendContainerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${baseName}-api-${uniqueSuffix}'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${backendIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      secrets: [
        {
          name: 'apim-subscription-key'
          value: apimSubscriptionIntake.listSecrets().primaryKey
        }
        {
          name: 'apim-risk-key'
          value: apimSubscriptionRisk.listSecrets().primaryKey
        }
        {
          name: 'apim-compliance-key'
          value: apimSubscriptionCompliance.listSecrets().primaryKey
        }
      ]
      registries: [
        {
          server: acr.properties.loginServer
          identity: backendIdentity.id
        }
      ]
      ingress: {
        external: true
        targetPort: 8000
        transport: 'http'
      }
    }
    template: {
      containers: [
        {
          name: 'api'
          image: backendImage
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            {
              name: 'AZURE_AUTH_MODE'
              value: 'managed_identity'
            }
            {
              name: 'AUTH_ENABLED'
              value: 'true'
            }
            {
              name: 'AUTH_TENANT_ID'
              value: authTenantId
            }
            {
              name: 'AUTH_CLIENT_ID'
              value: authClientId
            }
            {
              name: 'AZURE_CLIENT_ID'
              value: backendIdentity.properties.clientId
            }
            {
              name: 'AZURE_OPENAI_ENDPOINT'
              value: openAi.properties.endpoint
            }
            {
              name: 'AZURE_OPENAI_DEPLOYMENT'
              value: openAiModelName
            }
            {
              name: 'COSMOS_ENDPOINT'
              value: cosmos.properties.documentEndpoint
            }
            {
              name: 'STATE_BACKEND'
              value: 'cosmos'
            }
            {
              name: 'EVIDENCE_BACKEND'
              value: 'blob'
            }
            {
              name: 'BLOB_ENDPOINT'
              value: 'https://${evidenceStorage.name}.blob.${environment().suffixes.storage}'
            }
            {
              name: 'BLOB_CONTAINER'
              value: evidenceContainer.name
            }
            {
              name: 'COSMOS_STATE_CONTAINER'
              value: cosmosDemoStateContainer.name
            }
            {
              name: 'APIM_GATEWAY_URL'
              value: apim.properties.gatewayUrl
            }
            {
              name: 'LLM_PROVIDER'
              value: 'azure_apim'
            }
            {
              name: 'APIM_SUBSCRIPTION_KEY'
              secretRef: 'apim-subscription-key'
            }
            {
              name: 'APIM_SUBSCRIPTION_KEY_CLAIMS_INTAKE'
              secretRef: 'apim-subscription-key'
            }
            {
              name: 'APIM_SUBSCRIPTION_KEY_RISK_ASSESSMENT'
              secretRef: 'apim-risk-key'
            }
            {
              name: 'APIM_SUBSCRIPTION_KEY_COMPLIANCE'
              secretRef: 'apim-compliance-key'
            }
            {
              name: 'FRONTEND_URLS'
              value: 'https://${staticWebApp.properties.defaultHostname},https://${operatorStaticWebApp.properties.defaultHostname}'
            }
          ]
        }

      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

resource backendAcrPullRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: acr
  name: guid(acr.id, backendIdentity.id, acrPullRole)
  properties: {
    roleDefinitionId: acrPullRole
    principalId: backendIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource backendOpenAiRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: openAi
  name: guid(openAi.id, backendIdentity.id, cognitiveServicesUserRole)
  properties: {
    roleDefinitionId: cognitiveServicesUserRole
    principalId: backendIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource backendEvidenceRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(evidenceStorage.id, backendIdentity.id, 'Storage Blob Data Contributor')
  scope: evidenceStorage
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
    )
    principalId: backendIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ============================================================================
// Static Web App (Dashboard) — deployed to westeurope (not available in all regions)
// ============================================================================

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: staticWebAppName
  location: 'westeurope'
  sku: {
    name: 'Free'
    tier: 'Free'
  }

  properties: {}
}

// The deployed customer and operator variants are intentionally distinct static sites.
resource operatorStaticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: '${baseName}-operator-swa-${uniqueSuffix}'
  location: 'westeurope'
  sku: { name: 'Free', tier: 'Free' }
  properties: {}
}
// ============================================================================
// Cosmos DB (NoSQL) - persistencia de siniestros procesados
// ============================================================================
// Container particionado por /customer_id (alta cardinalidad, query pattern
// dominante: "siniestros del cliente X"). Modo serverless para minimizar coste
// en demo. AAD-only: deshabilitamos las claves locales y usamos data-plane RBAC.

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: cosmosName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    locations: [
      {
        locationName: location
        failoverPriority: 0
      }
    ]
    capabilities: [
      { name: 'EnableServerless' }
    ]
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
  }
}

resource cosmosDb 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmos
  name: 'insurance-claims'
  properties: {
    resource: {
      id: 'insurance-claims'
    }
  }
}

resource cosmosClaimsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDb
  name: 'claims'
  properties: {
    resource: {
      id: 'claims'
      partitionKey: {
        paths: ['/customer_id']
        kind: 'Hash'
      }

      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [
          { path: '/*' }
        ]
        excludedPaths: [
          { path: '/_etag/?' }
        ]
      }
      defaultTtl: -1
    }
  }
}

resource cosmosDemoStateContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDb
  name: 'demo-state'
  properties: {
    resource: {
      id: 'demo-state'
      partitionKey: {
        paths: ['/customer_id']
        kind: 'Hash'
      }
    }
  }
}

// Built-in Cosmos DB Data Contributor (data-plane RBAC, NOT ARM RBAC)
var cosmosDataContributorRoleId = '${cosmos.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'

resource cosmosDataPlaneRoleAssignment 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = if (!empty(cosmosDataPlanePrincipalId)) {
  parent: cosmos
  name: guid(cosmos.id, cosmosDataPlanePrincipalId, 'data-contributor')
  properties: {
    roleDefinitionId: cosmosDataContributorRoleId
    principalId: cosmosDataPlanePrincipalId
    scope: cosmos.id
  }

}

resource backendCosmosDataPlaneRoleAssignment 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  parent: cosmos
  name: guid(cosmos.id, backendIdentity.id, 'data-contributor')
  properties: {
    roleDefinitionId: cosmosDataContributorRoleId
    principalId: backendIdentity.properties.principalId
    scope: cosmos.id
  }
}

// ============================================================================
// Outputs
// ============================================================================

output openAiEndpoint string = openAi.properties.endpoint
output openAiName string = openAi.name
output apimGatewayUrl string = apim.properties.gatewayUrl
output apimName string = apim.name
output acrLoginServer string = acr.properties.loginServer
output acrName string = acr.name
output contentSafetyEndpoint string = contentSafety.properties.endpoint
output containerAppEnvId string = containerAppEnv.id
output backendContainerAppFqdn string = backendContainerApp.properties.configuration.ingress.fqdn
output staticWebAppName string = staticWebApp.name
output appInsightsConnectionString string = appInsights.properties.ConnectionString
output appInsightsInstrumentationKey string = appInsights.properties.InstrumentationKey
output aiServicesEndpoint string = aiServices.properties.endpoint
output cosmosEndpoint string = cosmos.properties.documentEndpoint
output cosmosDatabaseName string = cosmosDb.name
output cosmosContainerName string = cosmosClaimsContainer.name
