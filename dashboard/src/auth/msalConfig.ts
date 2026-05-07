/**
 * Configuración MSAL para Entra ID.
 *
 * - Si VITE_AUTH_ENABLED !== 'true' el frontend funciona en modo "demo abierto"
 *   (sin login) y se asume rol Operator (compatibilidad con la demo previa).
 * - Roles esperados (App Roles del app registration):
 *     Customer.Submit  → tab "Cliente"
 *     Operator.Review  → tabs Operario / Estadísticas / Clientes / Pólizas / Seguridad / Gobernanza
 */
import { Configuration, LogLevel, PublicClientApplication } from '@azure/msal-browser';

export const AUTH_ENABLED = import.meta.env.VITE_AUTH_ENABLED === 'true';

const CLIENT_ID = import.meta.env.VITE_AUTH_CLIENT_ID || '4e593597-088c-404c-984c-203259ff7dbe';
const TENANT_ID = import.meta.env.VITE_AUTH_TENANT_ID || '763b21d6-9a2e-4d90-88f9-d3c5cc8dba90';

// Scope de la API expuesta por el mismo app reg. Usamos el access token del propio
// cliente (audience = clientId) y leemos los roles desde el id token claim 'roles'.
export const API_SCOPES: string[] = [`api://${CLIENT_ID}/.default`];
export const ID_TOKEN_SCOPES: string[] = ['openid', 'profile'];

export const ROLE_CUSTOMER = 'Customer.Submit';
export const ROLE_OPERATOR = 'Operator.Review';

export const msalConfig: Configuration = {
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      logLevel: LogLevel.Warning,
      loggerCallback: (level, message) => {
        if (level <= LogLevel.Warning) console.warn('[msal]', message);
      },
      piiLoggingEnabled: false,
    },
  },
};

export const msalInstance = new PublicClientApplication(msalConfig);

// Inicialización requerida en MSAL v3+ antes de cualquier API call.
export const msalReady: Promise<void> = msalInstance.initialize().then(() => {
  // Procesar redirect (no-op si usamos popup)
  return msalInstance.handleRedirectPromise().then(() => undefined);
});
