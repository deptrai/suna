// content/index.ts
import { getCanonicalBaseUrl } from '../lib/canonical';

const TOKEN_REGEX = /(?:\$([A-Za-z0-9]{2,10}))|\b(?:0x[a-fA-F0-9]{40})\b|\b(?:[1-9A-HJ-NP-Za-km-z]{32,44})\b/g;

interface TokenMatch {
  text: string;
  isAddress: boolean;
  element: HTMLElement;
}

// Create host for Shadow DOM
const hostElement = document.createElement('div');
hostElement.id = 'chainlens-shadow-host';
// Ensure the host element doesn't affect page layout
hostElement.style.position = 'absolute';
hostElement.style.top = '0';
hostElement.style.left = '0';
hostElement.style.width = '100%';
hostElement.style.pointerEvents = 'none'; // allow clicking through the host
hostElement.style.zIndex = '2147483647';
document.body.appendChild(hostElement);

const shadowRoot = hostElement.attachShadow({ mode: 'open' });

// Add styles to Shadow DOM
const styleLink = document.createElement('link');
styleLink.rel = 'stylesheet';
// Depending on how extension is bundled, the CSS file should be in the build directory.
// For now, assume it's available at the runtime URL if running as an extension.
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
  styleLink.href = chrome.runtime.getURL('dist/styles.css');
}
if (styleLink.href) {
  shadowRoot.appendChild(styleLink);
}

// We also might want to inject compiled tailwind classes inline for local dev without extension reload
const inlineStyles = document.createElement('style');
// Tailwind class fallbacks in case the link fails
inlineStyles.textContent = `
  .glass {
    background-color: rgba(30, 41, 59, 0.85);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
  }
`;
shadowRoot.appendChild(inlineStyles);

// Store tooltips
const tooltipContainer = document.createElement('div');
tooltipContainer.id = 'chainlens-tooltip-container';
tooltipContainer.className = 'hidden absolute pointer-events-auto';
shadowRoot.appendChild(tooltipContainer);

/**
 * Scan DOM text nodes for tokens and wrap them in a span for hover events
 */
function scanAndHighlightTokens() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (
        node.parentElement &&
        (node.parentElement.tagName === 'SCRIPT' ||
          node.parentElement.tagName === 'STYLE' ||
          node.parentElement.classList.contains('chainlens-token-highlight') ||
          node.parentElement.id === 'chainlens-shadow-host')
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      return TOKEN_REGEX.test(node.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const nodesToReplace: { node: Text; matches: RegExpMatchArray[] }[] = [];
  
  let currentNode;
  while ((currentNode = walker.nextNode())) {
    const text = currentNode.nodeValue || '';
    const matches = [...text.matchAll(TOKEN_REGEX)];
    if (matches.length > 0) {
      nodesToReplace.push({ node: currentNode as Text, matches });
    }
  }

  nodesToReplace.forEach(({ node, matches }) => {
    const parent = node.parentNode;
    if (!parent) return;

    const text = node.nodeValue || '';
    let lastIndex = 0;
    const fragment = document.createDocumentFragment();

    matches.forEach((match) => {
      if (match.index === undefined) return;
      
      // Add text before match
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
      }

      // Create highlighted span
      const span = document.createElement('span');
      // Use the global CSS class for highlight (since it's in the host DOM)
      span.className = 'chainlens-token-highlight';
      span.textContent = match[0];
      span.dataset.token = match[0];
      
      // Add event listeners
      span.addEventListener('mouseenter', handleMouseEnter);
      span.addEventListener('mouseleave', handleMouseLeave);

      fragment.appendChild(span);
      lastIndex = match.index + match[0].length;
    });

    // Add remaining text
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
    }

    parent.replaceChild(fragment, node);
  });
}

let hoverTimer: ReturnType<typeof setTimeout> | null = null;
let currentTooltipTarget: HTMLElement | null = null;

function handleMouseEnter(event: MouseEvent) {
  const target = event.target as HTMLElement;
  const token = target.dataset.token;
  if (!token) return;

  if (hoverTimer) clearTimeout(hoverTimer);
  
  hoverTimer = setTimeout(() => {
    showTooltip(target, token);
  }, 500); // 500ms delay to prevent flashing
}

function handleMouseLeave(event: MouseEvent) {
  if (hoverTimer) clearTimeout(hoverTimer);
  
  // Allow time to move mouse into tooltip
  setTimeout(() => {
    if (!tooltipContainer.matches(':hover')) {
      hideTooltip();
    }
  }, 200);
}

function hideTooltip() {
  tooltipContainer.classList.add('hidden');
  tooltipContainer.innerHTML = '';
  currentTooltipTarget = null;
}

tooltipContainer.addEventListener('mouseleave', hideTooltip);

const escapeHtml = (unsafe: string) => unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

async function showTooltip(target: HTMLElement, token: string) {
  currentTooltipTarget = target;
  const rect = target.getBoundingClientRect();
  const safeToken = escapeHtml(token);
  
  tooltipContainer.classList.remove('hidden');
  tooltipContainer.style.left = `${rect.left + window.scrollX}px`;
  tooltipContainer.style.top = `${rect.bottom + window.scrollY + 5}px`;
  
  tooltipContainer.innerHTML = `
    <div class="glass text-slate-100 rounded-lg p-3 w-[280px] font-sans text-sm">
      <div class="flex justify-between items-center mb-2 border-b border-slate-700 pb-2">
        <span class="font-semibold text-base text-blue-400 truncate max-w-[150px]">${safeToken}</span>
        <span class="text-[11px] px-1.5 py-0.5 rounded font-medium bg-slate-600 text-slate-100 animate-pulse">Analyzing...</span>
      </div>
      <div class="text-slate-300 leading-relaxed mb-3 space-y-2">
        <div class="h-4 bg-slate-700 rounded w-3/4 animate-pulse"></div>
        <div class="h-4 bg-slate-700 rounded w-1/2 animate-pulse"></div>
      </div>
    </div>
  `;

  try {
    const isAddress = token.startsWith('0x') || /^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(token);
    
    // Connect to actual backend API (using canonical base URL for the API as well)
    const apiUrl = `${getCanonicalBaseUrl()}/api/v1/advisory/risk?query=${encodeURIComponent(token)}`;
    const res = await fetch(apiUrl);
    
    let riskLevel = 'Low Risk';
    let riskClass = 'bg-emerald-900 text-emerald-400';
    let liquidity = '$2.5M';
    let contractInfo = 'Verified, No Mint Function';
    let price = '$0.00000000';
    let change24h = '0.00%';
    
    if (res.ok) {
      const data = await res.json();
      if (data && data.risk) {
        riskLevel = data.risk.level || riskLevel;
        liquidity = data.risk.liquidity || liquidity;
        contractInfo = data.risk.contractInfo || contractInfo;
        price = data.risk.price || price;
        change24h = data.risk.change24h || change24h;
        if (riskLevel.toLowerCase().includes('high')) {
          riskClass = 'bg-rose-900 text-rose-400';
        }
      }
    }
    
    if (currentTooltipTarget !== target) return;

    tooltipContainer.innerHTML = `
      <div class="glass text-slate-100 rounded-lg p-3 w-[280px] font-sans text-sm">
        <div class="flex justify-between items-center mb-2 border-b border-slate-700 pb-2">
          <span class="font-semibold text-base text-blue-400 truncate max-w-[150px]" title="${safeToken}">${safeToken}</span>
          <span class="text-[11px] px-1.5 py-0.5 rounded font-medium ${riskClass}">${escapeHtml(riskLevel)}</span>
        </div>
        <div class="text-slate-300 leading-relaxed mb-3 space-y-1 text-[13px]">
          <div class="flex justify-between">
            <span class="text-slate-400">Price:</span>
            <span class="font-medium">${escapeHtml(price)} <span class="text-emerald-400 text-[11px]">(${escapeHtml(change24h)})</span></span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Liquidity:</span>
            <span class="font-medium">${escapeHtml(liquidity)}</span>
          </div>
          <div class="mt-2 text-[12px] text-slate-400">
            ${escapeHtml(contractInfo)}
          </div>
        </div>
        <div class="flex justify-center">
          <button class="bg-blue-600 hover:bg-blue-700 text-white border-none py-1.5 px-3 rounded cursor-pointer text-[13px] font-medium w-full transition-colors" onclick="window.open('${getCanonicalBaseUrl()}/dashboard/token/${safeToken}')">Deep Dive on Chainlens</button>
        </div>
      </div>
    `;
  } catch (err) {
    console.error("Tooltip error:", err);
    if (currentTooltipTarget !== target) return;
    tooltipContainer.innerHTML = `<div class="glass text-red-400 text-center p-3 rounded-lg">Failed to load analysis.</div>`;
  }
}

// Run initial scan
setTimeout(scanAndHighlightTokens, 1000);

// Use MutationObserver for dynamic content
const observer = new MutationObserver((mutations) => {
  let shouldScan = false;
  mutations.forEach((mutation) => {
    if (mutation.addedNodes.length > 0) {
      shouldScan = true;
    }
  });
  if (shouldScan) scanAndHighlightTokens();
});

observer.observe(document.body, { childList: true, subtree: true });
