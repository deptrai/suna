/**
 * Popup Entry Point
 * React entry point for extension popup
 * 
 * Sets up React 18 với createRoot và renders HelloExtension component
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { HelloExtension } from './components/HelloExtension';

// Get root element từ popup.html
const rootElement = document.getElementById('extension-root');

if (!rootElement) {
  throw new Error('Root element #extension-root not found in popup.html');
}

// Create React root và render app
const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <HelloExtension />
  </React.StrictMode>
);

