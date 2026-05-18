let installed = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function onRouteChange(callback: () => void): () => void {
  listeners.add(callback);

  if (!installed) {
    installed = true;

    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);

    history.pushState = function pushStatePatched(...args) {
      const result = originalPushState(...args);
      emit();
      return result;
    };

    history.replaceState = function replaceStatePatched(...args) {
      const result = originalReplaceState(...args);
      emit();
      return result;
    };

    window.addEventListener('popstate', emit);
  }

  return () => {
    listeners.delete(callback);
  };
}
