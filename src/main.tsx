import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { LanguageProvider } from './i18n';

/**
 * Root entry point for the React application.
 *
 * The <LanguageProvider> wraps the entire app so that every component
 * can access the current locale via `useLanguage()` and translated
 * UI strings via `useTranslation()`.
 */

const rootElement = document.getElementById('root');

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </React.StrictMode>
  );
} else {
  console.error('Failed to find the root element');
}
