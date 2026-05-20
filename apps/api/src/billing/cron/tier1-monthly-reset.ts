import { sql } from 'drizzle-orm';
import { db } from '../../shared/db';

export async function resetExpiredTier1Tokens() {
  const result = await db.execute(sql`
    UPDATE credit_accounts
    SET subscription_tokens = monthly_grant_amount,
        subscription_cycle_end = NOW() + INTERVAL '1 month',
        updated_at = NOW()
    WHERE tier = 'free'
      AND subscription_cycle_end IS NOT NULL
      AND subscription_cycle_end < NOW()
    RETURNING account_id
  `);

  const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
  console.log(`[TOKEN] Tier1 monthly reset executed: ${rows.length} accounts`);
  return { resetCount: rows.length };
}
