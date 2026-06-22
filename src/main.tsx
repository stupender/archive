/**
 * React entry point — mounts the app into the page's <div id="root">.
 *
 * Where it runs: renderer process (Chromium). Loaded by `index.html`.
 * Depends on: React, ReactDOM, ./App, ./styles/index.css.
 * Used by:    nothing imports this — it IS the entry point that Vite
 *   bundles and the HTML loads via `<script type="module" …>`.
 *
 * Notes:
 *  - `<React.StrictMode>` causes each component to render and run effects
 *    twice in development. This catches bugs but can be confusing if you
 *    see logs print twice — that's normal in dev, not in production.
 *  - Global CSS is imported here so Vite includes it in the bundle.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
