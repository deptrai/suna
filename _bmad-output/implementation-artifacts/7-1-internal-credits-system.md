# Story 7.1: Token Economy Foundation + Subscription Billing

Status: review

## Story

As a user muốn dùng Chainlens,
I want đăng ký tài khoản và được cấp token ngay lập tức theo gói, nâng cấp gói bất kỳ lúc nào, và mua thêm token khi hết,
so that tôi luôn có đủ token để dùng AI features mà không phải lo overcharge hay partial deduction.

## Context & Reframe

Story này thay thế toàn bộ "Internal Credits System" (FR12) bằng **Token Economy + Subscription Billing**:

| Concept | Quyết định |
|---------|-----------|
| Đơn vị | **Platform Tokens** (integer BIGINT, không phải USD) |
| 2 token pool | `subscription_tokens` (monthly grant, reset theo chu kỳ) + `topup_tokens` (mua thêm, không reset) |
| Deduction order | subscription_tokens trước → topup_tokens khi hết |
| Tier pricing | Tier 1 Free, Tier 2 $40/mo, Tier 3 $200/mo |
| Monthly reset | Cuối chu kỳ: subscription_tokens reset về grant mới. Topup_tokens KHÔNG reset |
| Auto-activate | Tier 1 tự kích hoạt khi đăng ký → grant tokens ngay |
| Top-up | Mua thêm tokens bất kỳ lúc nào, unit price cao hơn gói tháng |
| BYOC | **Không có BYOC** — mọi tier đều có sandbox |

**Kiến trúc đã locked (Winston, 2026-05-21).**

---

## Token Grant Amounts (env-configurable)

| Tier | Giá/tháng | Monthly token grant | Token pool |
|------|-----------|--------------------|-|
| Tier 1 (free) | $0 | `TIER1_MONTHLY_TOKENS` (default: 10,000,000 = 10M) | subscription_tokens |
| Tier 2 (pro)  | $40 | `TIER2_MONTHLY_TOKENS` (default: 200,000,000 = 200M) | subscription_tokens |
| Tier 3 (enterprise) | $200 | `TIER3_MONTHLY_TOKENS` (default: 1,500,000,000 = 1.5B) | subscription_tokens |
| Top-up | Theo gói | Theo gói mua | topup_tokens |

---

## Acceptance Criteria

### AC1 — DB Schema (additive migration — KHÔNG rename/drop)

Migration thêm vào bảng `credit_accounts`:

```sql
ALTER TABLE credit_accounts
  -- Pool 1: tokens từ gói tháng (reset cuối chu kỳ)
  ADD COLUMN subscription_tokens  BIGINT NOT NULL DEFAULT 0,
  -- Pool 2: tokens mua thêm (không bao giờ reset)
  ADD COLUMN topup_tokens         BIGINT NOT NULL DEFAULT 0,
  -- Ngày kết thúc chu kỳ billing hiện tại
  ADD COLUMN subscription_cycle_end TIMESTAMPTZ NULL,
  -- Số tokens granted mỗi chu kỳ (theo tier)
  ADD COLUMN monthly_grant_amount  BIGINT NOT NULL DEFAULT 0;
```

- Cột `balance` (numeric, USD) **giữ nguyên** — Stripe reconciliation
- Cột `tier` (varchar) **giữ nguyên** — vẫn là source of truth cho tier
- Tất cả cột mới NOT NULL (trừ `subscription_cycle_end`) → safe default 0
- Drizzle schema tại `packages/db/src/schema/epsilon.ts` phản ánh 4 cột mới
- Migration backfill: existing free accounts → `monthly_grant_amount = TIER1_MONTHLY_TOKENS`

### AC2 — Tier config trong code

File `apps/api/src/billing/services/tiers.ts` — cập nhật `TIERS` constant:

```typescript
// Các tier active (hidden: false)
free: {
  name: 'free',
  displayName: 'Free',
  monthlyPrice: 0,
  monthlyTokenGrant: config.TIER1_MONTHLY_TOKENS,   // từ env
  canPurchaseTopup: false,   // Tier 1 không mua top-up
  stripeMonthlyPriceId: null, // free → không cần Stripe price
},
pro: {  // đây là Tier 2
  name: 'pro',
  displayName: 'Pro',
  monthlyPrice: 40,
  monthlyTokenGrant: config.TIER2_MONTHLY_TOKENS,
  canPurchaseTopup: true,
  stripeMonthlyPriceId: config.STRIPE_PRICE_TIER2_MONTHLY,
},
enterprise: {  // Tier 3 — THÊM MỚI (hiện tại không có trong TIERS)
  name: 'enterprise',
  displayName: 'Enterprise',
  monthlyPrice: 200,
  monthlyTokenGrant: config.TIER3_MONTHLY_TOKENS,
  canPurchaseTopup: true,
  stripeMonthlyPriceId: config.STRIPE_PRICE_TIER3_MONTHLY,
},
```

- Legacy tiers (`tier_2_20` ... `tier_150_1200`) giữ nguyên `hidden: true`
- `monthlyTokenGrant` là field mới trong `TierConfig` interface (packages/shared/src/types/)

### AC3 — Config env vars (cập nhật từ AC3 cũ)

Thêm vào `apps/api/src/config.ts`:

```
# Token multipliers
TOKEN_MULTIPLIER_FREE              (default: 1.0)
TOKEN_MULTIPLIER_FREE_THINKING     (default: 1.5)
TOKEN_MULTIPLIER_PREMIUM           (default: 4.0)
TOKEN_MULTIPLIER_PREMIUM_THINKING  (default: 6.0)

# Model pools
FREE_MODEL_POOL                    (comma-separated, required)
PREMIUM_MODEL_POOL                 (comma-separated, required)

# Monthly token grants per tier
TIER1_MONTHLY_TOKENS               (default: 10000000)
TIER2_MONTHLY_TOKENS               (default: 200000000)
TIER3_MONTHLY_TOKENS               (default: 1500000000)

# Stripe price IDs
STRIPE_PRICE_TIER2_MONTHLY         (required for paid tiers)
STRIPE_PRICE_TIER3_MONTHLY         (required for paid tiers)

# Top-up pricing
TOPUP_TOKEN_UNIT_PRICE_CENTS       (default: 5)  # cents per 1M tokens (cao hơn gói tháng)
```

### AC4 — Tier 1 auto-activation khi đăng ký

Trong `apps/api/src/billing/index.ts` → route `POST /setup/initialize`:

1. Khi account chưa có `stripeSubscriptionId` VÀ tier = 'free':
   - Vẫn tạo free Stripe subscription như hiện tại (cho billing records)
   - **THÊM**: grant tokens ngay lập tức sau khi subscription tạo xong:
     ```typescript
     await grantSubscriptionTokens(accountId, 'free');
     ```
2. `grantSubscriptionTokens(accountId, tierName)`:
   - Lookup `monthlyTokenGrant` từ TIERS config
   - UPDATE `credit_accounts SET subscription_tokens = monthlyTokenGrant, monthly_grant_amount = monthlyTokenGrant, subscription_cycle_end = NOW() + INTERVAL '1 month'`
   - Nếu `stripeSubscriptionId` tồn tại → lấy `current_period_end` từ Stripe làm `subscription_cycle_end`
   - Log: `[TOKEN] accountId=X granted Y subscription_tokens (tier=free, initial activation)`
3. **KHÔNG còn comment "BYOC"** — free tier vẫn được sandbox (thay đổi comment nhưng KHÔNG thay đổi sandbox provisioning logic trong story này — đó là story riêng)

### AC5 — Stripe checkout cho Tier 2 và Tier 3 upgrade

Route mới hoặc mở rộng route hiện tại: `POST /v1/billing/subscriptions/upgrade`

```typescript
body: { targetTier: 'pro' | 'enterprise' }
```

Flow:
1. Validate `targetTier` có trong TIERS và `stripeMonthlyPriceId` configured
2. Tạo Stripe Checkout Session (subscription mode):
   - `price: STRIPE_PRICE_TIER2_MONTHLY` hoặc `TIER3_MONTHLY`
   - `metadata: { account_id, target_tier }`
   - `success_url`, `cancel_url`
3. Return `{ checkoutUrl: session.url }`
4. Sau khi Stripe redirect success → webhook `checkout.session.completed` xử lý grant tokens (AC6)

**Quan trọng**: KHÔNG grant tokens ngay tại route này — chờ webhook confirm payment để tránh fraud.

### AC6 — Webhook: `checkout.session.completed` (tier upgrade)

Trong `apps/api/src/billing/routes/webhooks.ts`:

Khi nhận `checkout.session.completed` với `metadata.target_tier`:
1. Update `credit_accounts.tier = target_tier`
2. Gọi `grantSubscriptionTokens(accountId, targetTier)`:
   - `subscription_tokens = monthlyTokenGrant` (SET, không cộng — gói mới thay gói cũ)
   - `monthly_grant_amount = monthlyTokenGrant`
   - `subscription_cycle_end = event.current_period_end` (từ Stripe subscription)
3. Update `stripeSubscriptionId`, `stripeSubscriptionStatus = 'active'`
4. Log: `[TOKEN] accountId=X upgraded to Y, granted Z subscription_tokens`

### AC7 — Webhook: `invoice.payment_succeeded` (monthly renewal)

Khi nhận `invoice.payment_succeeded` cho subscription (renewal hàng tháng):
1. Lookup `accountId` từ `stripeSubscriptionId`
2. Lookup `monthly_grant_amount` của account
3. **RESET**: `SET subscription_tokens = monthly_grant_amount` — KHÔNG cộng thêm, ghi đè
4. Update `subscription_cycle_end = new_period_end` (từ Stripe invoice)
5. Log: `[TOKEN] accountId=X monthly renewal: subscription_tokens reset to Y (unused tokens discarded)`

**Hành vi reset**: Tokens chưa dùng cuối tháng bị discard. Đây là intentional ("use it or lose it").

### AC8 — Tier 1 monthly reset (cron job)

Tier 1 free subscription không tạo Stripe invoice → cần cron job:

```typescript
// apps/api/src/billing/cron/tier1-monthly-reset.ts
// Chạy mỗi ngày một lần (cron: '0 2 * * *')
async function resetExpiredTier1Tokens() {
  await db.execute(sql`
    UPDATE credit_accounts
    SET subscription_tokens = monthly_grant_amount,
        subscription_cycle_end = NOW() + INTERVAL '1 month'
    WHERE tier = 'free'
      AND subscription_cycle_end IS NOT NULL
      AND subscription_cycle_end < NOW()
  `);
}
```

- Cron được register trong apps/api startup (Bun cron hoặc BullMQ scheduled job — theo pattern hiện tại của repo)
- Log số accounts được reset mỗi lần chạy

### AC9 — Top-up token purchase

Route mới: `POST /v1/billing/topup/checkout`

```typescript
body: { packageTokens: number }  // số tokens muốn mua (e.g., 10_000_000)
```

Flow:
1. Validate `packageTokens > 0` và account `canPurchaseTopup = true` (Tier 2/3) — Tier 1 return 403
2. Tính giá: `priceInCents = Math.ceil(packageTokens / 1_000_000 × TOPUP_TOKEN_UNIT_PRICE_CENTS)`
3. Tạo Stripe Checkout Session (payment mode, one-time):
   - `mode: 'payment'`
   - `line_items: [{ price_data: { unit_amount: priceInCents, currency: 'usd', product_data: { name: `${packageTokens.toLocaleString()} Chainlens Tokens` } }, quantity: 1 }]`
   - `metadata: { account_id, topup_tokens: packageTokens, type: 'topup' }`
4. Return `{ checkoutUrl }`

### AC10 — Webhook: `payment_intent.succeeded` (top-up)

Khi `payment_intent.succeeded` với `metadata.type = 'topup'`:
1. `topup_tokens += metadata.topup_tokens` (CỘNG THÊM, không reset)
2. Log: `[TOKEN] accountId=X topup: added Y topup_tokens (total: Z)`

**Khác biệt với subscription**: top-up cộng vào `topup_tokens`, KHÔNG ảnh hưởng `subscription_tokens`.

### AC11 — `atomic_use_tokens()` PostgreSQL function (2-pool deduction)

```sql
CREATE OR REPLACE FUNCTION atomic_use_tokens(
  p_account_id TEXT,
  p_amount     BIGINT
) RETURNS TABLE(success BOOL, sub_remaining BIGINT, topup_remaining BIGINT, error TEXT) AS $$
DECLARE
  v_sub     BIGINT;
  v_topup   BIGINT;
  v_from_sub   BIGINT;
  v_from_topup BIGINT;
BEGIN
  SELECT subscription_tokens, topup_tokens
    INTO v_sub, v_topup
    FROM credit_accounts WHERE account_id = p_account_id FOR UPDATE;

  -- Tổng có đủ không?
  IF (v_sub + v_topup) < p_amount THEN
    RETURN QUERY SELECT false, v_sub, v_topup, 'insufficient_tokens'::TEXT;
    RETURN;
  END IF;

  -- Dùng subscription_tokens trước
  v_from_sub   := LEAST(v_sub, p_amount);
  v_from_topup := p_amount - v_from_sub;

  UPDATE credit_accounts
    SET subscription_tokens = subscription_tokens - v_from_sub,
        topup_tokens = topup_tokens - v_from_topup
    WHERE account_id = p_account_id;

  RETURN QUERY SELECT true,
    (v_sub - v_from_sub),
    (v_topup - v_from_topup),
    NULL::TEXT;
END;
$$ LANGUAGE plpgsql;
```

- Không còn daily quota check — replaced bởi 2-pool deduction
- Error code duy nhất: `'insufficient_tokens'` (không còn `'daily_quota_exceeded'`)

### AC12 — TokenBilling service (cập nhật từ AC5 cũ)

File: `apps/api/src/router/services/token-billing.ts`

```typescript
export interface TokenDeductParams {
  accountId: string;
  actualTokens: number;
  modelPool: 'free' | 'premium';
  thinkingEnabled: boolean;
}

export interface TokenDeductResult {
  success: boolean;
  tokensDeducted: bigint;
  subRemaining: bigint;
  topupRemaining: bigint;
  error?: 'insufficient_tokens' | 'db_error';
}

export function getMultiplier(pool: 'free' | 'premium', thinking: boolean): number
export async function deductTokens(params: TokenDeductParams): Promise<TokenDeductResult>
export async function getTokenBalances(accountId: string): Promise<{
  subscriptionTokens: bigint;
  topupTokens: bigint;
  total: bigint;
  cycleEnd: Date | null;
}>
```

- `deductTokens` gọi `atomic_use_tokens()` qua Drizzle raw SQL
- `EPSILON_BILLING_INTERNAL_ENABLED=false` → skip, return `{ success: true, tokensDeducted: 0n, subRemaining: 0n, topupRemaining: 0n }`

### AC13 — ModelPool service (giữ nguyên từ AC4 cũ)

File: `apps/api/src/router/services/model-pool.ts`

```typescript
export function pickModel(pool: 'free' | 'premium'): string  // round-robin, env-driven
export function poolForTier(tier: AccountTier): 'free' | 'premium'
// tier1 → 'free'; tier2/tier3 → 'premium'
```

### AC14 — Account state response (cập nhật)

`GET /v1/billing/account-state` phải trả về:

```json
{
  "tier": "pro",
  "subscription_tokens": 150000000,
  "topup_tokens": 5000000,
  "total_tokens": 155000000,
  "monthly_grant": 200000000,
  "cycle_end": "2026-06-21T00:00:00Z",
  "can_purchase_topup": true
}
```

Không expose raw USD balance.

### AC15 — Backward compatibility (ZERO REGRESSION)

- Tất cả hàm trong `apps/api/src/repositories/credits.ts` KHÔNG thay đổi signature
- `atomic_use_credits()` PostgreSQL function KHÔNG bị drop hay sửa
- Existing billing routes (`/subscriptions`, `/payments`, `/credits`) không bị break
- Cột `balance` (USD) trong credit_accounts giữ nguyên — được update bởi Stripe webhook như cũ

### AC16 — Error response format

Khi `deductTokens` fail → caller trả về 402:

```json
{
  "error": "insufficient_tokens",
  "tokens_required": 4000,
  "subscription_tokens": 1200,
  "topup_tokens": 0,
  "total_available": 1200,
  "upgrade_url": "/dashboard/billing"
}
```

### AC18 — Pricing page (frontend, static)

File: `apps/web/src/app/(home)/pricing/page.tsx` — **ĐÃ SHIP 2026-05-21**

Trang static hiển thị 3 tier card:

| Tier | Giá | Tokens | CTA |
|------|-----|--------|-----|
| Free | $0/mo | 10M/mo | "Get Started Free" → `/auth` hoặc `/dashboard` |
| Pro | $40/mo | 200M/mo | "Upgrade to Pro" → `/auth` hoặc `/dashboard/billing?upgrade=tier2` |
| Enterprise | $200/mo | 1.5B/mo | "Upgrade to Enterprise" → `/auth` hoặc `/dashboard/billing?upgrade=tier3` |

- "Most Popular" badge trên Pro card
- Token multiplier explainer section: free 1×, free+thinking 1.5×, premium 4×, premium+thinking 6×
- Auth-aware: unauthenticated → `/auth`, authenticated → `/dashboard` hoặc billing
- Dùng `Reveal` component (framer-motion fade-in) nhất quán với landing page design system

### AC19 — Pricing nav link

File: `apps/web/src/lib/site-config.ts` — **ĐÃ SHIP 2026-05-21**

```typescript
{ id: 4, name: 'Pricing', href: '/pricing' },
```

Hiển thị trong cả desktop nav (centered links) và mobile drawer (full-screen typography).

---

### AC17 — Unit tests (bắt buộc, tất cả pass)

File: `apps/api/src/__tests__/unit/token-billing.test.ts`

Coverage bắt buộc:
- `getMultiplier`: 4 combinations (free/premium × thinking on/off)
- `deductTokens`: success (sub only), success (sub + topup), insufficient fail, billing-disabled bypass
- `pickModel`: round-robin, empty pool throw
- `poolForTier`: tier1→free, tier2→premium, tier3→premium
- `grantSubscriptionTokens`: grant mới (initial), upgrade (SET không cộng)
- Monthly reset cron: chỉ reset free tier đã hết chu kỳ
- Top-up: topup_tokens cộng thêm, subscription_tokens không đổi

Minimum: 20 test cases. `cd apps/api && bun test src/__tests__/unit/token-billing.test.ts` → all green.

---

## Tasks / Subtasks

- [x] Task 1: DB Migration (AC1, AC2)
  - [x] 1.1 Thêm 4 cột vào `packages/db/src/schema/epsilon.ts` (creditAccounts)
  - [x] 1.2 Thêm `monthlyTokenGrant` vào `TierConfig` interface trong `packages/shared/src/types/`
  - [x] 1.3 Tạo migration SQL: `ALTER TABLE ADD COLUMN` × 4 + backfill `monthly_grant_amount` WHERE tier='free'
  - [x] 1.4 Tạo `atomic_use_tokens()` function trong migration SQL (AC11)
  - [x] 1.5 Verify Drizzle typecheck pass

- [x] Task 2: Config & Tier config (AC2, AC3)
  - [x] 2.1 Thêm `TIER1/2/3_MONTHLY_TOKENS`, `STRIPE_PRICE_TIER2/3_MONTHLY`, `TOPUP_TOKEN_UNIT_PRICE_CENTS` vào `apps/api/src/config.ts`
  - [x] 2.2 Cập nhật `TIERS` constant trong `tiers.ts`: thêm `enterprise` tier, thêm `monthlyTokenGrant` + `canPurchaseTopup` field, sửa `free` và `pro`

- [x] Task 3: grantSubscriptionTokens helper (AC4, AC6)
  - [x] 3.1 Tạo hàm `grantSubscriptionTokens(accountId, tierName, cycleEnd?)` trong billing service
  - [x] 3.2 SET (không cộng) `subscription_tokens = monthlyTokenGrant`, `monthly_grant_amount`, `subscription_cycle_end`

- [x] Task 4: Tier 1 auto-activation (AC4)
  - [x] 4.1 Trong `POST /setup/initialize`: sau khi tạo Stripe subscription → gọi `grantSubscriptionTokens(accountId, 'free')`
  - [x] 4.2 Update comment "BYOC" → phản ánh đúng ("Free tier có sandbox theo quota")

- [x] Task 5: Tier 2/3 upgrade checkout (AC5)
  - [x] 5.1 Tạo `POST /v1/billing/subscriptions/upgrade` route
  - [x] 5.2 Tạo Stripe Checkout Session subscription mode với đúng price ID

- [x] Task 6: Webhooks (AC6, AC7, AC10)
  - [x] 6.1 `checkout.session.completed` (target_tier metadata) → update tier + grant tokens
  - [x] 6.2 `invoice.payment_succeeded` (subscription renewal) → reset subscription_tokens + update cycle_end
  - [x] 6.3 `payment_intent.succeeded` với `type='topup'` metadata → cộng vào topup_tokens

- [x] Task 7: Tier 1 cron reset (AC8)
  - [x] 7.1 Tạo `apps/api/src/billing/cron/tier1-monthly-reset.ts`
  - [x] 7.2 Register cron trong apps/api startup (theo pattern cron hiện tại của repo nếu có, hoặc BullMQ)

- [x] Task 8: Top-up checkout endpoint (AC9)
  - [x] 8.1 Tạo `POST /v1/billing/topup/checkout` route
  - [x] 8.2 Validate `canPurchaseTopup` per tier — Tier 1 → 403
  - [x] 8.3 Stripe Checkout payment mode (one-time), metadata `type='topup'`

- [x] Task 9: Services (AC12, AC13)
  - [x] 9.1 Tạo `apps/api/src/router/services/model-pool.ts`
  - [x] 9.2 Tạo `apps/api/src/router/services/token-billing.ts` với `getMultiplier`, `deductTokens`, `getTokenBalances`

- [x] Task 10: Account state update (AC14)
  - [x] 10.1 Cập nhật `GET /v1/billing/account-state` response shape thêm token fields

- [x] Task 11: Unit tests (AC17)
  - [x] 11.1 Tạo `apps/api/src/__tests__/unit/token-billing.test.ts`
  - [x] 11.2 20+ test cases, all green

- [x] Task 12: Frontend pricing page (AC18, AC19) — **DONE 2026-05-21**
  - [x] 12.1 Thêm `{ id: 4, name: 'Pricing', href: '/pricing' }` vào `siteConfig.nav.links`
  - [x] 12.2 Rewrite `apps/web/src/app/(home)/pricing/page.tsx` — 3 tier cards, token explainer, auth-aware CTAs

---

## Dev Notes

### CRITICAL: Drizzle additive-only (AR3)
Chỉ ADD column. KHÔNG rename/drop `balance`, `tier`, `stripeSubscriptionId`, và mọi cột hiện tại của `credit_accounts`.

### Existing files PHẢI đọc trước khi sửa

| File | Dòng | Lý do |
|------|------|-------|
| `packages/db/src/schema/epsilon.ts` | 599–692 | Cấu trúc creditAccounts, không được break |
| `apps/api/src/repositories/credits.ts` | Toàn bộ | Pattern atomic_use_credits → model cho atomic_use_tokens |
| `apps/api/src/billing/index.ts` | Toàn bộ | Setup initialize flow, webhook routing |
| `apps/api/src/billing/routes/webhooks.ts` | Toàn bộ | Stripe webhook handler hiện tại |
| `apps/api/src/billing/services/tiers.ts` | Toàn bộ | TIERS constant, TierConfig type |
| `apps/api/src/config.ts` | 881–1131 | Pattern parse env vars |
| `packages/shared/src/types/` | Toàn bộ | TierConfig interface cần update |

### Token deduction formula
```
cost_tokens = Math.ceil(actual_llm_tokens × getMultiplier(pool, thinking))
```
`Math.ceil` — làm tròn lên, platform không lỗ token.

### 2-pool deduction order
subscription_tokens tiêu trước → khi hết → topup_tokens. Không bao giờ deduct ngược lại. Rationale: subscription tokens expire nên ưu tiên tiêu trước.

### Stripe events phân biệt top-up vs subscription renewal

| Event | metadata.type | Hành động |
|-------|--------------|-----------|
| `checkout.session.completed` | `'upgrade'` | Update tier + SET subscription_tokens |
| `invoice.payment_succeeded` | (subscription) | RESET subscription_tokens = monthly_grant |
| `payment_intent.succeeded` | `'topup'` | ADD topup_tokens |

Luôn check `metadata.type` trước khi process — không dựa vào event type alone.

### Scope boundary (story này KHÔNG làm)
- **KHÔNG** wire `deductTokens()` vào LLM call chain — transition story riêng
- **KHÔNG** thay đổi sandbox provisioning logic (all-tiers-get-sandbox) — story riêng  
- **KHÔNG** implement entitlement middleware — story T1.2
- **KHÔNG** ẩn "Add LLM Mode" UI — story T2.7
- **ĐÃ DONE (2026-05-21)**: Pricing page và nav link — xem AC18/AC19

### Bun runtime (AR2)
`bun test`, `Bun.file`/`Bun.write`, ESM imports.

### Project Structure Notes

```
# Files mới tạo
packages/db/src/migrations/YYYYMMDD_add_token_economy.sql
apps/api/src/router/services/model-pool.ts
apps/api/src/router/services/token-billing.ts
apps/api/src/billing/cron/tier1-monthly-reset.ts
apps/api/src/__tests__/unit/token-billing.test.ts
apps/web/src/app/(home)/pricing/page.tsx           — [DONE 2026-05-21]

# Files sửa (additive)
packages/db/src/schema/epsilon.ts              — ADD 4 cột
packages/shared/src/types/                     — ADD monthlyTokenGrant, canPurchaseTopup vào TierConfig
apps/api/src/config.ts                         — ADD TIER*/STRIPE_PRICE_*/TOPUP_* keys
apps/api/src/billing/services/tiers.ts         — UPDATE TIERS, ADD enterprise tier
apps/api/src/billing/index.ts                  — grantSubscriptionTokens sau initialize
apps/api/src/billing/routes/webhooks.ts        — ADD checkout + renewal + topup handlers
apps/api/src/billing/routes/account-state.ts   — ADD token fields vào response
# Route mới
apps/api/src/billing/routes/subscriptions.ts   — ADD /upgrade endpoint (hoặc file mới)
apps/api/src/billing/routes/topup.ts           — ADD /topup/checkout endpoint

# Files sửa (frontend)
apps/web/src/lib/site-config.ts               — ADD Pricing nav link [DONE 2026-05-21]
```

### References
- [Architecture decision: Token Economy, No BYOC, Subscription Model] — Winston session 2026-05-21
- [Source: packages/db/src/schema/epsilon.ts#L599-692] — creditAccounts hiện tại
- [Source: apps/api/src/repositories/credits.ts] — atomic_use_credits pattern
- [Source: apps/api/src/billing/index.ts#L48-116] — setup/initialize flow
- [Source: apps/api/src/billing/services/tiers.ts#L51-80] — TIERS constant
- [FR12: Internal Credits System → reframed]
- [NFR8: Atomic Credit Deduction]
- [NFR9: Strict Rate Limiting Tier 1]
- [AR3: Drizzle additive-only migrations]

---

## Dev Agent Record

### Agent Model Used

GPT-5 Codex CLI

### Debug Log References

- `bun test src/__tests__/unit/token-billing.test.ts` (21/21 pass)
- `bun run typecheck` (pass)

### Completion Notes List

- Implemented token economy foundation with additive DB schema changes (`subscription_tokens`, `topup_tokens`, `subscription_cycle_end`, `monthly_grant_amount`) and `atomic_use_tokens()` migration function.
- Added token config/env vars and tier config updates (free/pro/enterprise monthly grants, top-up capability, Stripe monthly price IDs).
- Implemented token grant helper and integrated grant on setup initialize + webhook subscription flows.
- Added upgrade and top-up checkout endpoints and webhook handling for top-up token increments and monthly grant refresh.
- Added Tier 1 monthly token reset cron job and account-state token fields (`subscription_tokens`, `topup_tokens`, `total_tokens`, `monthly_grant`, `cycle_end`, `can_purchase_topup`).
- Added model pool + token billing services and unit tests for multiplier/model-pool/token-billing bypass behavior.

### File List

- packages/db/src/schema/epsilon.ts
- packages/db/drizzle/0013_token_economy_foundation.sql
- packages/db/drizzle/meta/_journal.json
- apps/api/src/types.ts
- apps/api/src/config.ts
- apps/api/src/billing/services/tiers.ts
- apps/api/src/billing/services/token-grants.ts
- apps/api/src/billing/index.ts
- apps/api/src/billing/routes/subscriptions.ts
- apps/api/src/billing/services/webhooks.ts
- apps/api/src/billing/cron/tier1-monthly-reset.ts
- apps/api/src/billing/routes/account-state.ts
- apps/api/src/router/services/model-pool.ts
- apps/api/src/router/services/token-billing.ts
- apps/api/src/__tests__/unit/token-billing.test.ts

### Change Log

- 2026-05-21: Completed Story 7.1 implementation for Token Economy Foundation + Subscription Billing (backend scope), validated with token-billing unit tests and API typecheck; story moved to review.
