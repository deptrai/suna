# Extension Side Panel Implementation Guide

**Generated:** 2025-01-15  
**Analyst:** Mary (Business Analyst)  
**For:** Luis  
**Project:** Suna.so Browser Extension

---

## Quick Start Implementation Guide

### Step 1: Update Manifest.json

```json
{
  "manifest_version": 3,
  "name": "Suna Coin Analysis",
  "version": "1.0.0",
  "permissions": [
    "storage",
    "activeTab",
    "side_panel"  // ← ADD THIS
  ],
  "side_panel": {
    "default_path": "sidepanel.html"  // ← ADD THIS
  },
  "action": {
    // Remove "default_popup" or keep for fallback
    "default_title": "Suna Coin Analysis",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "background": {
    "service_worker": "background.js",
    "type": "module"
  }
}
```

### Step 2: Update Background Worker

```typescript
// extension/src/background/background.ts

chrome.runtime.onInstalled.addListener(() => {
  // Enable side panel on extension icon click
  chrome.sidePanel.setPanelBehavior({ 
    openPanelOnActionClick: true 
  });
});

// Optional: Handle side panel opening programmatically
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});
```

### Step 3: Create Sidepanel Files

**sidepanel.html:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Suna Coin Analysis</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100vh;
      overflow: hidden;
    }
    #extension-root {
      width: 100%;
      height: 100%;
    }
  </style>
</head>
<body>
  <div id="extension-root"></div>
  <script src="sidepanel.js"></script>
</body>
</html>
```

**sidepanel.tsx:**
```typescript
// extension/src/sidepanel/sidepanel.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { SidePanelApp } from './components/SidePanelApp';

const rootElement = document.getElementById('extension-root');

if (!rootElement) {
  throw new Error('Root element #extension-root not found');
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <SidePanelApp />
  </React.StrictMode>
);
```

### Step 4: Update Webpack Config

```javascript
// extension/webpack.config.js
module.exports = {
  entry: {
    'content-script': './src/content-script/content-script.ts',
    'background': './src/background/background.ts',
    'sidepanel': './src/sidepanel/sidepanel.tsx',  // ← ADD THIS
    // 'popup': './src/popup/popup.tsx',  // ← REMOVE or keep for fallback
  },
  // ... rest of config
};
```

### Step 5: Create Side Panel Layout Component

```typescript
// extension/src/sidepanel/components/SidePanelLayout.tsx
import React from 'react';

export function SidePanelLayout({ children }: { children: React.ReactNode }) {
  const handleClose = () => {
    // Close side panel
    chrome.sidePanel.setOptions({ enabled: false });
    // Or use window.close() if supported
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b">
        <h1 className="text-lg font-bold">Suna Coin Analysis</h1>
        <button onClick={handleClose} className="text-gray-500 hover:text-gray-700">
          ✕
        </button>
      </header>

      {/* Content Area */}
      <main className="flex-1 overflow-y-auto p-4">
        {children}
      </main>

      {/* Footer */}
      <footer className="p-4 border-t">
        <button className="w-full bg-blue-500 text-white py-2 px-4 rounded">
          Generate Full Report
        </button>
      </footer>
    </div>
  );
}
```

### Step 6: Update CSS for Full Height

```css
/* extension/src/sidepanel/sidepanel.css */
body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100vh;
  overflow: hidden;
}

#extension-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}
```

---

## Testing Checklist

- [ ] Side panel opens when clicking extension icon
- [ ] Side panel displays correctly (full height)
- [ ] Header, content, footer all visible
- [ ] Content area is scrollable
- [ ] Close button works
- [ ] Side panel persists (doesn't close on click outside)
- [ ] Layout adapts to different panel widths (400-600px)
- [ ] Message passing from content script works
- [ ] API calls from side panel work
- [ ] Authentication flow works

---

## Browser Compatibility

- ✅ Chrome 114+
- ✅ Edge 114+
- ⚠️ Firefox: Not supported (use popup fallback)
- ⚠️ Safari: Not supported (use popup fallback)

---

## Migration Notes

1. **Keep Popup Code (Temporarily):**
   - Keep popup code in git for reference
   - Remove after side panel is stable

2. **Backward Compatibility:**
   - Optionally detect browser support
   - Fallback to popup if side panel not supported

3. **Testing:**
   - Test on Chrome 114+
   - Test on Edge 114+
   - Test different panel widths
   - Test message passing
   - Test API calls

---

## References

- [Chrome Extension Side Panel API](https://developer.chrome.com/docs/extensions/reference/sidePanel/)
- [Story 12.2: Side Panel Layout & Structure](./../stories/12-2-popup-layout-structure.md)
- [Side Panel Migration Analysis](./extension-popup-to-sidepanel-analysis.md)

---

**Generated by:** Mary (Business Analyst)  
**Date:** 2025-01-15

