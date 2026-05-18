import type { DomainParser } from './types';
import { dexScreenerParser } from './dexscreener';
import { coinMarketCapParser } from './coinmarketcap';

export const PARSERS: DomainParser[] = [dexScreenerParser, coinMarketCapParser];

export function getActiveParser(): DomainParser | null {
  const host = window.location.hostname;
  return PARSERS.find((parser) => parser.hostnames.some((h) => host.includes(h))) ?? null;
}
