-- Story 7.1: Token economy columns for credit_accounts
-- Adds subscription_tokens, topup_tokens, monthly_grant_amount, subscription_cycle_end
-- Also adds atomic_use_tokens() stored procedure for deduction

ALTER TABLE epsilon.credit_accounts
  ADD COLUMN IF NOT EXISTS subscription_tokens BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS topup_tokens BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_grant_amount BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subscription_cycle_end TIMESTAMPTZ;

-- Atomic token deduction stored procedure
-- Returns: success (bool), sub_remaining (bigint), topup_remaining (bigint)
CREATE OR REPLACE FUNCTION epsilon.atomic_use_tokens(
  p_account_id UUID,
  p_cost BIGINT
)
RETURNS TABLE(success BOOLEAN, sub_remaining BIGINT, topup_remaining BIGINT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_sub BIGINT;
  v_topup BIGINT;
  v_from_sub BIGINT;
  v_from_topup BIGINT;
BEGIN
  -- Lock the row
  SELECT subscription_tokens, topup_tokens
    INTO v_sub, v_topup
    FROM epsilon.credit_accounts
   WHERE account_id = p_account_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0::BIGINT, 0::BIGINT;
    RETURN;
  END IF;

  IF v_sub + v_topup < p_cost THEN
    RETURN QUERY SELECT FALSE, v_sub, v_topup;
    RETURN;
  END IF;

  -- Drain subscription_tokens first, then topup
  v_from_sub := LEAST(p_cost, v_sub);
  v_from_topup := p_cost - v_from_sub;

  UPDATE epsilon.credit_accounts
     SET subscription_tokens = subscription_tokens - v_from_sub,
         topup_tokens        = topup_tokens - v_from_topup,
         updated_at          = NOW()
   WHERE account_id = p_account_id;

  RETURN QUERY SELECT TRUE, v_sub - v_from_sub, v_topup - v_from_topup;
END;
$$;

GRANT EXECUTE ON FUNCTION epsilon.atomic_use_tokens(UUID, BIGINT) TO service_role;
