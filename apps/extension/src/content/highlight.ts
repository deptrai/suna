export interface HighlightHandlers {
  onMouseEnter: (event: MouseEvent) => void;
  onMouseLeave: (event: MouseEvent) => void;
}

function buildSpan(token: string, handlers: HighlightHandlers): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'chainlens-token-highlight';
  span.textContent = token;
  span.dataset.token = token.replace(/^\$/, '');
  span.addEventListener('mouseenter', handlers.onMouseEnter);
  span.addEventListener('mouseleave', handlers.onMouseLeave);
  return span;
}

export function wrapHighlight(
  target: Text | HTMLElement,
  token: string,
  handlers: HighlightHandlers,
): HTMLSpanElement {
  const cleanToken = token.replace(/^\$/, '');
  const span = buildSpan(token, handlers);
  span.dataset.token = cleanToken;

  if (target instanceof Text) {
    if (!target.parentNode) return span;
    target.parentNode.replaceChild(span, target);
    return span;
  }

  if (target.classList.contains('chainlens-token-highlight')) {
    return target as HTMLSpanElement;
  }

  const parent = target.parentNode;
  if (!parent) {
    target.classList.add('chainlens-token-highlight');
    target.setAttribute('data-token', cleanToken);
    target.addEventListener('mouseenter', handlers.onMouseEnter);
    target.addEventListener('mouseleave', handlers.onMouseLeave);
    return target as HTMLSpanElement;
  }

  parent.replaceChild(span, target);
  return span;
}
