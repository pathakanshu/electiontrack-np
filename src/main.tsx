import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

/**
 * Root entry point for the React application.
 * This replaces the previous imperative init() function from main.ts.
 * The MapLibre initialization and data fetching will be moved into
 * React components and hooks in the next phases.
 */

const rootElement = document.getElementById('root');

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  console.error('Failed to find the root element');
}
