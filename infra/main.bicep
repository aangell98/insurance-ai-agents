// ============================================================================
// Insurance AI Agents Demo - Main Infrastructure
// ============================================================================
// Deploys: Azure OpenAI, APIM, Content Safety, ACR, Container Apps, 
//          Static Web Apps, Application Insights, AI Foundry Project
// ============================================================================

targetScope = 'resourceGroup'

@description('Base name for all resources')
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
    adminUserEnabled: true
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
    url: '${openAi.properties.endpoint}openai'
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
    url: '${contentSafety.properties.endpoint}'
    tls: {
      validateCertificateChain: true
      validateCertificateName: true
    }
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
output staticWebAppName string = staticWebApp.name
output appInsightsConnectionString string = appInsights.properties.ConnectionString
output appInsightsInstrumentationKey string = appInsights.properties.InstrumentationKey
output aiServicesEndpoint string = aiServices.properties.endpoint
