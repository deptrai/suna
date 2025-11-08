/**
 * Side Panel Entry Point
 * 
 * This is the main entry point for the side panel React application.
 * Full implementation will be in Story 10.4 và Story 12.1.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';

// Placeholder component
const SidePanelApp: React.FC = () => {
  return (
    <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
      <h1>Suna Coin Analysis</h1>
      <p>Side panel will be implemented in Story 10.4 và Story 12.1</p>
    </div>
  );
};

// Mount React app
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <SidePanelApp />
    </React.StrictMode>
  );
}


