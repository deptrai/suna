/**
 * Side Panel Entry Point
 * 
 * This is the main entry point for the side panel React application.
 * Full implementation will be in Story 12.1.
 */

import { createRoot } from 'react-dom/client';
import { HelloExtension } from './components/HelloExtension';

// Mount React app
const container = document.getElementById('extension-root');
if (!container) {
  throw new Error('Root element #extension-root not found');
}

const root = createRoot(container);
root.render(
  <HelloExtension />
);


