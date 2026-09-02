import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { I18nProvider } from './i18n.ts'

// Unregister all Service Workers to clear any old ad scripts or caching issues
if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const registration of registrations) void registration.unregister();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)
