import { createClient } from '@/lib/supabase/server';

export async function getServerAuthHeader(): Promise<Record<string, string>> {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` };
    }
    // No session — anonymous fetch; downstream will return 401 if endpoint requires auth.
  } catch (err) {
    // Log so SSR auth failures are observable (rather than silently 401-ing every section).
    console.warn('[getServerAuthHeader] Supabase session lookup failed:', err instanceof Error ? err.message : err);
  }
  return {};
}
