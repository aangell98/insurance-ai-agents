import React from 'react'
import ReactDOM from 'react-dom/client'
import { MsalProvider } from '@azure/msal-react'
import App from './App'
import { msalInstance, msalReady, AUTH_ENABLED } from './auth/msalConfig'
import './index.css'

async function bootstrap() {
  if (AUTH_ENABLED) {
    await msalReady;
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </React.StrictMode>,
  )
}

bootstrap();
