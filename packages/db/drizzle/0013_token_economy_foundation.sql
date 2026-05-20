ALTER TABLE credit_accounts
  ADD COLUMN IF NOT EXISTS subscription_tokens BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS topup_tokens BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subscription_cycle_end TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS monthly_grant_amount BIGINT NOT NULL DEFAULT 0;

UPDATE credit_accounts
SET monthly_grant_amount = COALESCE(NULLIF(monthly_grant_amount, 0), 10000000)
WHERE tier = 'free';

CREATE OR REPLACE FUNCTION atomic_use_tokens(
  p_account_id UUID,
  p_amount BIGINT
)
RETURNS TABLE(success BOOL, sub_remaining BIGINT, topup_remaining BIGINT, error TEXT)
LANGUAGE plpgsql
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
