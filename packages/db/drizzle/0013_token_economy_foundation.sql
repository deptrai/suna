ALTER TABLE credit_accounts
  ADD COLUMN IF NOT EXISTS subscription_tokens BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS topup_tokens BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subscription_cycle_end TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS monthly_grant_amount BIGINT NOT NULL DEFAULT 0;

-- P11: Backfill existing Tier 2/3 accounts missing monthly_grant_amount
UPDATE credit_accounts
SET monthly_grant_amount = 200000000
WHERE tier IN ('pro', 'tier2')
  AND monthly_grant_amount = 0;

UPDATE credit_accounts
SET monthly_grant_amount = 1500000000
WHERE tier IN ('enterprise', 'tier3')
  AND monthly_grant_amount = 0;

UPDATE credit_accounts
SET monthly_grant_amount = COALESCE(NULLIF(monthly_grant_amount, 0), 10000000)
WHERE tier = 'free';

-- P10: Backfill pre-migration free accounts that never got a cycle_end
UPDATE credit_accounts
SET subscription_cycle_end = NOW() + INTERVAL '1 month'
WHERE tier = 'free'
  AND subscription_cycle_end IS NULL;

-- P23: SECURITY DEFINER prevents search_path injection
CREATE OR REPLACE FUNCTION atomic_use_tokens(
  p_account_id UUID,
  p_amount BIGINT
)
RETURNS TABLE(success BOOL, sub_remaining BIGINT, topup_remaining BIGINT, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = epsilon, public
AS $$
DECLARE
  v_sub BIGINT;
  v_topup BIGINT;
  v_from_sub BIGINT;
  v_from_topup BIGINT;
BEGIN
  SELECT subscription_tokens, topup_tokens
    INTO v_sub, v_topup
    FROM credit_accounts
   WHERE account_id = p_account_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::BIGINT, 0::BIGINT, 'account_not_found'::TEXT;
    RETURN;
  END IF;

  IF (v_sub + v_topup) < p_amount THEN
    RETURN QUERY SELECT false, v_sub, v_topup, 'insufficient_tokens'::TEXT;
    RETURN;
  END IF;

  v_from_sub := LEAST(v_sub, p_amount);
  v_from_topup := p_amount - v_from_sub;

  UPDATE credit_accounts
     SET subscription_tokens = subscription_tokens - v_from_sub,
         topup_tokens = topup_tokens - v_from_topup,
         updated_at = NOW()
   WHERE account_id = p_account_id;

  RETURN QUERY SELECT true, (v_sub - v_from_sub), (v_topup - v_from_topup), NULL::TEXT;
END;
$$;
