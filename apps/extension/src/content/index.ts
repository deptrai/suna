// content/index.ts
import { getCanonicalBaseUrl } from '../lib/canonical';

const TOKEN_REGEX = /(?:\$([A-Za-z0-9]{2,10}))|\b(?:0x[a-fA-F0-9]{40})\b|\b(?:[1-9A-HJ-NP-Za-km-z]{43,44})\b/g;

const RISK_CLASS_MAP: Record<string, string> = {
  low: 'bg-emerald-900 text-emerald-400',
  medium: 'bg-yellow-900 text-yellow-400',
  high: 'bg-rose-900 text-rose-400',
  critical: 'bg-rose-900 text-rose-400',
  scam: 'bg-rose-900 text-rose-400',
};

function getRiskClass(level: string): string {
  const key = level.toLowerCase().replace(/\s+risk$/i, '').trim();
  return RISK_CLASS_MAP[key] ?? 'bg-slate-700 text-slate-300';
}

const escapeHtml = (unsafe: string) =>
  unsafe.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

function init() {
  // Dedup guard — prevents multiple injections on SPA re-navigation
  if (document.getElementById('chainlens-shadow-host')) return;

  const hostElement = document.createElement('div');
  hostElement.id = 'chainlens-shadow-host';
  hostElement.style.cssText = 'position:absolute;top:0;left:0;width:100%;pointer-events:none;z-index:2147483646';
  document.body.appendChild(hostElement);

  const shadowRoot = hostElement.attachShadow({ mode: 'open' });

  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    const href = chrome.runtime.getURL('dist/styles.css');
    if (href.startsWith('chrome-extension://')) {
      const styleLink = document.createElement('link');
      styleLink.rel = 'stylesheet';
      styleLink.href = href;
      shadowRoot.appendChild(styleLink);
    }
  }

  const tooltipContainer = document.createElement('div');
  tooltipContainer.id = 'chainlens-tooltip-container';
  tooltipContainer.style.cssText = 'display:none;position:absolute;pointer-events:auto';
  shadowRoot.appendChild(tooltipContainer);

  let hoverTimer: ReturnType<typeof setTimeout> | null = null;
  let currentTooltipTarget: HTMLElement | null = null;
  let scanning = false;

  function hideTooltip() {
    tooltipContainer.style.display = 'none';
    tooltipContainer.classList.add('hidden');
    tooltipContainer.replaceChildren();
    currentTooltipTarget = null;
  }

  tooltipContainer.addEventListener('mouseleave', hideTooltip);

  async function showTooltip(target: HTMLElement, token: string) {
    currentTooltipTarget = target;
    const rect = target.getBoundingClientRect();
    const safeToken = escapeHtml(token);

    tooltipContainer.style.display = 'block';
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const apiUrl = `${getCanonicalBaseUrl()}/api/v1/advisory/risk?query=${encodeURIComponent(token)}`;
      const res = await fetch(apiUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (currentTooltipTarget !== target) return;

      let riskLevel = 'Unknown';
      let riskClass = getRiskClass(riskLevel);
      let liquidity: string | null = null;
      let contractInfo: string | null = null;
      let price: string | null = null;
      let change24h: string | null = null;

      if (res.ok) {
        const data = await res.json();
        if (data?.risk) {
          riskLevel = data.risk.level ?? riskLevel;
          riskClass = getRiskClass(riskLevel);
          liquidity = data.risk.liquidity ?? null;
          contractInfo = data.risk.contractInfo ?? null;
          price = data.risk.price ?? null;
          change24h = data.risk.change24h ?? null;
        }
      }

      const priceRow = price
        ? `<div class="flex justify-between"><span class="text-slate-400">Price:</span><span class="font-medium">${escapeHtml(price)}${change24h ? ` <span class="text-emerald-400 text-[11px]">(${escapeHtml(change24h)})</span>` : ''}</span></div>`
        : '';
      const liquidityRow = liquidity
        ? `<div class="flex justify-between"><span class="text-slate-400">Liquidity:</span><span class="font-medium">${escapeHtml(liquidity)}</span></div>`
        : '';
      const contractRow = contractInfo
        ? `<div class="mt-2 text-[12px] text-slate-400">${escapeHtml(contractInfo)}</div>`
        : '';
      const noDataRow = !price && !liquidity && !contractInfo
        ? `<div class="text-[13px] text-slate-400 text-center">No data available</div>`
        : '';

      tooltipContainer.innerHTML = `
        <div class="glass text-slate-100 rounded-lg p-3 w-[280px] font-sans text-sm">
          <div class="flex justify-between items-center mb-2 border-b border-slate-700 pb-2">
            <span class="font-semibold text-base text-blue-400 truncate max-w-[150px]" title="${safeToken}">${safeToken}</span>
            <span class="text-[11px] px-1.5 py-0.5 rounded font-medium ${riskClass}">${escapeHtml(riskLevel)}</span>
          </div>
          <div class="text-slate-300 leading-relaxed mb-3 space-y-1 text-[13px]">
            ${priceRow}${liquidityRow}${contractRow}${noDataRow}
          </div>
          <div class="flex justify-center">
            <button id="chainlens-open-btn" class="bg-blue-600 hover:bg-blue-700 text-white border-none py-1.5 px-3 rounded cursor-pointer text-[13px] font-medium w-full transition-colors">Deep Dive on Chainlens</button>
          </div>
        </div>
      `;

      tooltipContainer.querySelector('#chainlens-open-btn')?.addEventListener('click', () => {
        window.open(`${getCanonicalBaseUrl()}/dashboard/token/${encodeURIComponent(token)}`, '_blank');
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (currentTooltipTarget !== target) return;
      console.error('Chainlens tooltip error:', err);
      tooltipContainer.innerHTML = `<div class="glass text-red-400 text-center p-3 rounded-lg">Failed to load analysis.</div>`;
    }
  }

  function handleMouseEnter(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const token = target.dataset.token;
    if (!token) return;
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => showTooltip(target, token), 500);
  }

  function handleMouseLeave() {
    if (hoverTimer) clearTimeout(hoverTimer);
    setTimeout(() => {
      if (!tooltipContainer.matches(':hover')) hideTooltip();
    }, 200);
  }

  function highlightNodes(roots: Node[]) {
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          const el = node.parentElement;
          if (!el) return NodeFilter.FILTER_REJECT;
          if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return NodeFilter.FILTER_REJECT;
          if (el.classList.contains('chainlens-token-highlight')) return NodeFilter.FILTER_REJECT;
          if (el.closest('#chainlens-shadow-host')) return NodeFilter.FILTER_REJECT;
          TOKEN_REGEX.lastIndex = 0;
          return TOKEN_REGEX.test(node.nodeValue ?? '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      });

      const nodesToReplace: { node: Text; matches: RegExpMatchArray[] }[] = [];
      let currentNode;
      while ((currentNode = walker.nextNode())) {
        TOKEN_REGEX.lastIndex = 0;
        const matches = [...(currentNode.nodeValue ?? '').matchAll(TOKEN_REGEX)];
        if (matches.length > 0) nodesToReplace.push({ node: currentNode as Text, matches });
      }

      for (const { node, matches } of nodesToReplace) {
        const parent = node.parentNode;
        if (!parent) continue;
        const text = node.nodeValue ?? '';
        let lastIndex = 0;
        const fragment = document.createDocumentFragment();

        for (const match of matches) {
          if (match.index === undefined) continue;
          if (match.index > lastIndex) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
          }
          const span = document.createElement('span');
          span.className = 'chainlens-token-highlight';
          span.textContent = match[0];
          // For `$TICKER` matches, group 1 captures the bare ticker (e.g. "BTC").
          // For 0x/Solana matches, group 1 is undefined and we use the full match.
          // Strip leading `$` defensively so advisory API and deep-link URLs receive a clean token.
          span.dataset.token = match[1] ?? match[0].replace(/^\$/, '');
          span.addEventListener('mouseenter', handleMouseEnter);
          span.addEventListener('mouseleave', handleMouseLeave);
          fragment.appendChild(span);
          lastIndex = match.index + match[0].length;
        }

        if (lastIndex < text.length) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
        }
        parent.replaceChild(fragment, node);
      }
    }
  }

  function scanAndHighlightTokens() {
    if (scanning) return;
    scanning = true;
    try {
      highlightNodes([document.body]);
    } finally {
      scanning = false;
    }
  }

  setTimeout(scanAndHighlightTokens, 500);

  const observer = new MutationObserver((mutations) => {
    if (scanning) return;
    const addedNodes: Node[] = [];
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
          addedNodes.push(node);
        }
      }
    }
    if (addedNodes.length === 0) return;
    scanning = true;
    try {
      highlightNodes(addedNodes);
    } finally {
      scanning = false;
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.body) {
  init();
} else {
  document.addEventListener('DOMContentLoaded', init);
}
