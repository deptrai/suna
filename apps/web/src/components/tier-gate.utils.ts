export function isTier1(tierKey?: string | null): boolean {
  return !tierKey || tierKey === 'free' || tierKey === 'none';
}
