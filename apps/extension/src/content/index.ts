// content/index.ts

const TOKEN_REGEX = /(?:\$([A-Za-z0-9]{2,10}))|(?:0x[a-fA-F0-9]{40})/g;

interface TokenMatch {
  text: string;
  isAddress: boolean;
  element: HTMLElement;
}

// Store tooltips
const tooltipContainer = document.createElement('div');
tooltipContainer.id = 'chainlens-tooltip-container';
document.body.appendChild(tooltipContainer);

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
          node.parentElement.classList.contains('chainlens-token-highlight'))
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
  tooltipContainer.style.display = 'none';
  tooltipContainer.innerHTML = '';
  currentTooltipTarget = null;
}

tooltipContainer.addEventListener('mouseleave', hideTooltip);

async function showTooltip(target: HTMLElement, token: string) {
  currentTooltipTarget = target;
  const rect = target.getBoundingClientRect();
  
  tooltipContainer.style.display = 'block';
  tooltipContainer.style.left = `${rect.left + window.scrollX}px`;
  tooltipContainer.style.top = `${rect.bottom + window.scrollY + 5}px`;
  
  tooltipContainer.innerHTML = `
    <div class="chainlens-tooltip">
      <div class="header">
        <span class="token-name">${token}</span>
        <span class="badge risk-analyzing">Analyzing...</span>
      </div>
      <div class="content">
        Fetching risk analysis via Hono RPC...
      </div>
      <div class="footer">
        <button class="expand-btn">Expand to Chainlens</button>
      </div>
    </div>
  `;

  // Fetch from Hono backend
  try {
    const isAddress = token.startsWith('0x');
    // TODO: Replace with actual Hono RPC client
    // const res = await rpc.api.v1.advisory.risk.$get({ query: token });
    // const data = await res.json();
    
    // Simulate delay
    await new Promise(r => setTimeout(r, 800));
    
    if (currentTooltipTarget !== target) return;

    tooltipContainer.innerHTML = `
      <div class="chainlens-tooltip">
        <div class="header">
          <span class="token-name">${token}</span>
          <span class="badge risk-safe">Low Risk</span>
        </div>
        <div class="content">
          <p>Liquidity: $2.5M</p>
          <p>Contract: Verified, No Mint Function</p>
        </div>
        <div class="footer">
          <button class="expand-btn" onclick="window.open('https://app.chainlens.com/analyze?token=${token}')">Deep Dive on Chainlens</button>
        </div>
      </div>
    `;
  } catch (err) {
    if (currentTooltipTarget !== target) return;
    tooltipContainer.innerHTML = `<div class="chainlens-tooltip error">Failed to load analysis.</div>`;
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
