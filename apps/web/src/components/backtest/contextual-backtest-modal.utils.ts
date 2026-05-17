export function shouldRemountEditor(
  previousCode: string | undefined,
  nextCode: string | undefined,
): boolean {
  return previousCode !== nextCode;
}

export function shouldCloseContextualModal(
  nextOpen: boolean,
  isExecuting: boolean,
  confirmClose: () => boolean,
): boolean {
  if (!nextOpen && isExecuting) {
    return confirmClose();
  }

  return true;
}
