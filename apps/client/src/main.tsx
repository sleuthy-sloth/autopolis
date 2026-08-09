import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './ui/styles.css';

// Global error trap — surfaces the real stack for otherwise-silent exceptions.
window.addEventListener('error', (e) => {
  console.error('[global-error]', e.error?.stack ?? e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[unhandled-rejection]', e.reason?.stack ?? e.reason?.message ?? String(e.reason));
});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
