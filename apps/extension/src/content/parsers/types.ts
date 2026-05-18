export type TokenSource = 'url' | 'aria' | 'data-attr' | 'selector';

export interface ExtractedToken {
  element: HTMLElement;
  token: string;
  source: TokenSource;
}

export interface DomainParser {
  hostnames: string[];
  extract(root: HTMLElement): ExtractedToken[];
  observeTarget?: () => HTMLElement | null;
}
