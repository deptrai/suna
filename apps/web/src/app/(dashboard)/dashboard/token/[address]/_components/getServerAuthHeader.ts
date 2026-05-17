import { createClient } from '@/lib/supabase/server';

export async function getServerAuthHeader(): Promise<Record<string, string>> {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` };
    }
  } catch {
    // fallback to no auth
  }
  return {};
}
