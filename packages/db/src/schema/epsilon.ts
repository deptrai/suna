import {
  pgSchema,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  integer,
  numeric,
  bigint,
  index,
  uniqueIndex,
  unique,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const epsilonSchema = pgSchema('epsilon');

export const sandboxStatusEnum = epsilonSchema.enum('sandbox_status', [
  'provisioning',
  'active',
  'stopped',
  'archived',
  'pooled',
  'error',
]);

export const sandboxProviderEnum = epsilonSchema.enum('sandbox_provider', [
  'daytona',
  'local_docker',
  'justavps',
]);

export const deploymentStatusEnum = epsilonSchema.enum('deployment_status', [
  'pending',
  'building',
  'deploying',
  'active',
  'failed',
  'stopped',
]);

export const deploymentSourceEnum = epsilonSchema.enum('deployment_source', [
  'git',
  'code',
  'files',
  'tar',
]);


export const apiKeyStatusEnum = epsilonSchema.enum('api_key_status', [
  'active',
  'revoked',
  'expired',
]);

export const apiKeyTypeEnum = epsilonSchema.enum('api_key_type', [
  'user',
  'sandbox',
]);

export const integrationStatusEnum = epsilonSchema.enum('integration_status', [
  'active',
  'revoked',
  'expired',
  'error',
]);

// ─── Accounts & Members ─────────────────────────────────────────────────────
// Replaces basejump.account_user. Fully epsilon-native.

export const accountRoleEnum = epsilonSchema.enum('account_role', [
  'owner',
  'admin',
  'member',
]);

export const accounts = epsilonSchema.table(
  'accounts',
  {
    accountId: uuid('account_id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    personalAccount: boolean('personal_account').default(true).notNull(),
    setupCompleteAt: timestamp('setup_complete_at', { withTimezone: true }),
    setupWizardStep: integer('setup_wizard_step').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
);

export const accountMembers = epsilonSchema.table(
  'account_members',
  {
    userId: uuid('user_id').notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.accountId, { onDelete: 'cascade' }),
    accountRole: accountRoleEnum('account_role').default('owner').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_account_members_user_id').on(table.userId),
    index('idx_account_members_account_id').on(table.accountId),
    uniqueIndex('idx_account_members_user_account').on(table.userId, table.accountId),
  ],
);

export const sandboxes = epsilonSchema.table(
  'sandboxes',
  {
    sandboxId: uuid('sandbox_id').defaultRandom().primaryKey(),
    accountId: uuid('account_id').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    provider: sandboxProviderEnum('provider').default('daytona').notNull(),
    externalId: text('external_id'),
    status: sandboxStatusEnum('status').default('provisioning').notNull(),
    baseUrl: text('base_url').notNull(),
    config: jsonb('config').default({}).$type<Record<string, unknown>>(),
    metadata: jsonb('metadata').default({}).$type<Record<string, unknown>>(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    // Billing: tracks included vs additional (paid) instances
    isIncluded: boolean('is_included').default(false).notNull(),
    stripeSubscriptionItemId: text('stripe_subscription_item_id'),
  },
  (table) => [
    index('idx_sandboxes_account').on(table.accountId),
    index('idx_sandboxes_external_id').on(table.externalId),
    index('idx_sandboxes_status').on(table.status),
  ],
);

export const scopeEffectEnum = epsilonSchema.enum('scope_effect', [
  'grant',
  'revoke',
]);

export const sandboxMembers = epsilonSchema.table(
  'sandbox_members',
  {
    sandboxId: uuid('sandbox_id')
      .notNull()
      .references(() => sandboxes.sandboxId, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    addedBy: uuid('added_by'),
    addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
    monthlySpendCapCents: integer('monthly_spend_cap_cents'),
    currentPeriodCents: integer('current_period_cents').notNull().default(0),
    currentPeriodStart: bigint('current_period_start', { mode: 'number' }),
  },
  (table) => [
    uniqueIndex('idx_sandbox_members_unique').on(table.sandboxId, table.userId),
    index('idx_sandbox_members_user').on(table.userId),
    index('idx_sandbox_members_sandbox').on(table.sandboxId),
  ],
);

export const sandboxMemberScopes = epsilonSchema.table(
  'sandbox_member_scopes',
  {
    sandboxId: uuid('sandbox_id')
      .notNull()
      .references(() => sandboxes.sandboxId, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    scope: text('scope').notNull(),
    effect: scopeEffectEnum('effect').notNull(),
    grantedBy: uuid('granted_by'),
    grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_sandbox_member_scopes_unique').on(
      table.sandboxId,
      table.userId,
      table.scope,
    ),
    index('idx_sandbox_member_scopes_lookup').on(table.sandboxId, table.userId),
  ],
);

export const sandboxInvites = epsilonSchema.table(
  'sandbox_invites',
  {
    inviteId: uuid('invite_id').defaultRandom().primaryKey(),
    sandboxId: uuid('sandbox_id')
      .notNull()
      .references(() => sandboxes.sandboxId, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    invitedBy: uuid('invited_by'),
    initialRole: accountRoleEnum('initial_role').default('member').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true })
      .default(sql`now() + interval '14 days'`)
      .notNull(),
  },
  (table) => [
    index('idx_sandbox_invites_email').on(table.email),
    index('idx_sandbox_invites_sandbox').on(table.sandboxId),
    index('idx_sandbox_invites_expires_at').on(table.expiresAt),
  ],
);

// ─── Pool Resources ─────────────────────────────────────────────────────────

export const poolResources = epsilonSchema.table(
  'pool_resources',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: sandboxProviderEnum('provider').notNull(),
    serverType: varchar('server_type', { length: 64 }).notNull(),
    location: varchar('location', { length: 64 }).notNull(),
    desiredCount: integer('desired_count').notNull().default(2),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_pool_resources_unique').on(table.provider, table.serverType, table.location),
  ],
);

export const poolSandboxes = epsilonSchema.table(
  'pool_sandboxes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    resourceId: uuid('resource_id').references(() => poolResources.id, { onDelete: 'set null' }),
    provider: sandboxProviderEnum('provider').notNull(),
    externalId: text('external_id').notNull(),
    baseUrl: text('base_url').notNull().default(''),
    serverType: varchar('server_type', { length: 64 }).notNull(),
    location: varchar('location', { length: 64 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('provisioning'),
    metadata: jsonb('metadata').default({}).$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    readyAt: timestamp('ready_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_pool_sandboxes_claim').on(table.status, table.createdAt),
    uniqueIndex('idx_pool_sandboxes_external_id_active').on(table.externalId),
  ],
);

export const deployments = epsilonSchema.table(
  'deployments',
  {
    deploymentId: uuid('deployment_id').defaultRandom().primaryKey(),
    accountId: uuid('account_id').notNull(),
    sandboxId: uuid('sandbox_id').references(() => sandboxes.sandboxId, { onDelete: 'set null' }),
    freestyleId: text('freestyle_id'),
    status: deploymentStatusEnum('status').default('pending').notNull(),

    // Source
    sourceType: deploymentSourceEnum('source_type').notNull(),
    sourceRef: text('source_ref'),
    framework: varchar('framework', { length: 50 }),

    // Config
    domains: jsonb('domains').default([]).$type<string[]>(),
    liveUrl: text('live_url'),
    envVars: jsonb('env_vars').default({}).$type<Record<string, string>>(),
    buildConfig: jsonb('build_config').$type<Record<string, unknown>>(),
    entrypoint: text('entrypoint'),

    // Metadata
    error: text('error'),
    version: integer('version').default(1).notNull(),
    metadata: jsonb('metadata').default({}).$type<Record<string, unknown>>(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_deployments_account').on(table.accountId),
    index('idx_deployments_sandbox').on(table.sandboxId),
    index('idx_deployments_status').on(table.status),
    index('idx_deployments_live_url').on(table.liveUrl),
    index('idx_deployments_created').on(table.createdAt),
  ],
);



// ─── API Keys (sandbox-scoped) ──────────────────────────────────────────────

export const epsilonApiKeys = epsilonSchema.table(
  'api_keys',
  {
    keyId: uuid('key_id').defaultRandom().primaryKey(),
    sandboxId: uuid('sandbox_id')
      .notNull()
      .references(() => sandboxes.sandboxId, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull(),
    publicKey: varchar('public_key', { length: 64 }).notNull(),
    secretKeyHash: varchar('secret_key_hash', { length: 128 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    type: apiKeyTypeEnum('type').default('user').notNull(),
    status: apiKeyStatusEnum('status').default('active').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_epsilon_api_keys_public_key').on(table.publicKey),
    index('idx_epsilon_api_keys_secret_hash').on(table.secretKeyHash),
    index('idx_epsilon_api_keys_sandbox').on(table.sandboxId),
    index('idx_epsilon_api_keys_account').on(table.accountId),
  ],
);

// ─── Integration Credentials (per-account provider credentials) ─────────────
// Stores Pipedream (or future provider) credentials per account.
// Resolution order: request headers → account DB → API env defaults.

export const integrationCredentials = epsilonSchema.table(
  'integration_credentials',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id').notNull(),
    provider: varchar('provider', { length: 50 }).notNull().default('pipedream'),
    credentials: jsonb('credentials').notNull().default({}).$type<Record<string, string>>(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_integration_credentials_account_provider').on(table.accountId, table.provider),
    index('idx_integration_credentials_account').on(table.accountId),
  ],
);

// ─── Integrations (account-level OAuth connections) ─────────────────────────

export const integrations = epsilonSchema.table(
  'integrations',
  {
    integrationId: uuid('integration_id').defaultRandom().primaryKey(),
    accountId: uuid('account_id').notNull(),
    app: varchar('app', { length: 255 }).notNull(),
    appName: varchar('app_name', { length: 255 }),
    providerName: varchar('provider_name', { length: 50 }).notNull(),
    providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
    label: varchar('label', { length: 255 }),
    status: integrationStatusEnum('status').default('active').notNull(),
    scopes: jsonb('scopes').default([]).$type<string[]>(),
    metadata: jsonb('metadata').default({}).$type<Record<string, unknown>>(),
    connectedAt: timestamp('connected_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_integrations_account').on(table.accountId),
    index('idx_integrations_app').on(table.app),
    index('idx_integrations_provider_account').on(table.providerAccountId),
    uniqueIndex('idx_integrations_account_provider_account').on(table.accountId, table.providerAccountId),
  ],
);

export const sandboxIntegrations = epsilonSchema.table(
  'sandbox_integrations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sandboxId: uuid('sandbox_id')
      .notNull()
      .references(() => sandboxes.sandboxId, { onDelete: 'cascade' }),
    integrationId: uuid('integration_id')
      .notNull()
      .references(() => integrations.integrationId, { onDelete: 'cascade' }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_sandbox_integration_unique').on(table.sandboxId, table.integrationId),
    index('idx_sandbox_integrations_sandbox').on(table.sandboxId),
  ],
);

// ─── Server Entries ──────────────────────────────────────────────────────────
// User-configured server/instance entries (persisted from the frontend).
// Auth tokens are NOT stored — they remain in the browser's localStorage.

export const serverEntries = epsilonSchema.table(
  'server_entries',
  {
    /** Auto-generated row PK. */
    entryId: uuid('entry_id').defaultRandom().primaryKey(),
    /** Frontend-assigned entry ID (e.g. 'default', 'cloud-sandbox', 'srv_xxx'). Unique per account. */
    id: varchar('id', { length: 128 }).notNull(),
    /** Owner account — scopes entries per-user. Null in local mode (single user). */
    accountId: uuid('account_id'),
    label: varchar('label', { length: 255 }).notNull(),
    url: text('url').notNull(),
    isDefault: boolean('is_default').default(false).notNull(),
    provider: sandboxProviderEnum('provider'),
    sandboxId: text('sandbox_id'),
    mappedPorts: jsonb('mapped_ports').$type<Record<string, string>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_server_entries_default').on(table.isDefault),
    index('idx_server_entries_account').on(table.accountId),
    uniqueIndex('idx_server_entries_account_id').on(table.accountId, table.id),
  ],
);

// ─── OAuth2 Provider ──────────────────────────────────────────────────────

export const oauthClients = epsilonSchema.table(
  'oauth_clients',
  {
    clientId: uuid('client_id').defaultRandom().primaryKey(),
    clientSecretHash: varchar('client_secret_hash', { length: 128 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    redirectUris: jsonb('redirect_uris').default([]).$type<string[]>(),
    scopes: jsonb('scopes').default([]).$type<string[]>(),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
);

export const oauthAuthorizationCodes = epsilonSchema.table(
  'oauth_authorization_codes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 128 }).notNull(),
    clientId: uuid('client_id').notNull().references(() => oauthClients.clientId, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    accountId: uuid('account_id').notNull(),
    redirectUri: text('redirect_uri').notNull(),
    scopes: jsonb('scopes').default([]).$type<string[]>(),
    codeChallenge: text('code_challenge').notNull(),
    codeChallengeMethod: varchar('code_challenge_method', { length: 10 }).default('S256').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_oauth_codes_code').on(table.code),
    index('idx_oauth_codes_client').on(table.clientId),
    index('idx_oauth_codes_expires').on(table.expiresAt),
  ],
);

export const oauthAccessTokens = epsilonSchema.table(
  'oauth_access_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tokenHash: varchar('token_hash', { length: 128 }).notNull(),
    clientId: uuid('client_id').notNull().references(() => oauthClients.clientId, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    accountId: uuid('account_id').notNull(),
    scopes: jsonb('scopes').default([]).$type<string[]>(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_oauth_access_token_hash').on(table.tokenHash),
    index('idx_oauth_access_tokens_client').on(table.clientId),
    index('idx_oauth_access_tokens_user').on(table.userId),
  ],
);

export const oauthRefreshTokens = epsilonSchema.table(
  'oauth_refresh_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tokenHash: varchar('token_hash', { length: 128 }).notNull(),
    accessTokenId: uuid('access_token_id').notNull().references(() => oauthAccessTokens.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull().references(() => oauthClients.clientId, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    accountId: uuid('account_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_oauth_refresh_token_hash').on(table.tokenHash),
    index('idx_oauth_refresh_tokens_client').on(table.clientId),
  ],
);

export const sandboxesRelations = relations(sandboxes, ({ one, many }) => ({
  account: one(accounts, {
    fields: [sandboxes.accountId],
    references: [accounts.accountId],
  }),
  deployments: many(deployments),
  apiKeys: many(epsilonApiKeys),
  sandboxIntegrationLinks: many(sandboxIntegrations),
  members: many(sandboxMembers),
}));

export const sandboxMembersRelations = relations(sandboxMembers, ({ one }) => ({
  sandbox: one(sandboxes, {
    fields: [sandboxMembers.sandboxId],
    references: [sandboxes.sandboxId],
  }),
}));

export const sandboxInvitesRelations = relations(sandboxInvites, ({ one }) => ({
  sandbox: one(sandboxes, {
    fields: [sandboxInvites.sandboxId],
    references: [sandboxes.sandboxId],
  }),
}));

export const deploymentsRelations = relations(deployments, ({ one }) => ({
  sandbox: one(sandboxes, {
    fields: [deployments.sandboxId],
    references: [sandboxes.sandboxId],
  }),
}));

export const epsilonApiKeysRelations = relations(epsilonApiKeys, ({ one }) => ({
  sandbox: one(sandboxes, {
    fields: [epsilonApiKeys.sandboxId],
    references: [sandboxes.sandboxId],
  }),
}));

export const integrationsRelations = relations(integrations, ({ many }) => ({
  sandboxIntegrationLinks: many(sandboxIntegrations),
}));

export const sandboxIntegrationsRelations = relations(sandboxIntegrations, ({ one }) => ({
  sandbox: one(sandboxes, {
    fields: [sandboxIntegrations.sandboxId],
    references: [sandboxes.sandboxId],
  }),
  integration: one(integrations, {
    fields: [sandboxIntegrations.integrationId],
    references: [integrations.integrationId],
  }),
}));

// ─── Account Relations ──────────────────────────────────────────────────────

export const accountsRelations = relations(accounts, ({ many }) => ({
  members: many(accountMembers),
  sandboxes: many(sandboxes),
}));

export const accountMembersRelations = relations(accountMembers, ({ one }) => ({
  account: one(accounts, {
    fields: [accountMembers.accountId],
    references: [accounts.accountId],
  }),
}));

// ─── Billing / Credits ─────────────────────────────────────────────────────

export const billingCustomers = epsilonSchema.table(
  'billing_customers',
  {
    accountId: uuid('account_id').notNull(),
    id: text().primaryKey().notNull(),
    email: text(),
    active: boolean(),
    provider: text(),
  },
  (table) => [
    index('idx_epsilon_billing_customers_account_id').on(table.accountId),
  ],
);

export const creditAccounts = epsilonSchema.table(
  'credit_accounts',
  {
    accountId: uuid('account_id').primaryKey().notNull(),
    balance: numeric('balance', { precision: 12, scale: 4 }).default('0').notNull(),
    lifetimeGranted: numeric('lifetime_granted', { precision: 12, scale: 4 }).default('0').notNull(),
    lifetimePurchased: numeric('lifetime_purchased', { precision: 12, scale: 4 }).default('0').notNull(),
    lifetimeUsed: numeric('lifetime_used', { precision: 12, scale: 4 }).default('0').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow(),
    lastGrantDate: timestamp('last_grant_date', { withTimezone: true, mode: 'string' }),
    tier: varchar('tier', { length: 50 }).default('free'),
    billingCycleAnchor: timestamp('billing_cycle_anchor', { withTimezone: true, mode: 'string' }),
    nextCreditGrant: timestamp('next_credit_grant', { withTimezone: true, mode: 'string' }),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
    expiringCredits: numeric('expiring_credits', { precision: 12, scale: 4 }).default('0').notNull(),
    nonExpiringCredits: numeric('non_expiring_credits', { precision: 12, scale: 4 }).default('0').notNull(),
    dailyCreditsBalance: numeric('daily_credits_balance', { precision: 10, scale: 2 }).default('0').notNull(),
    trialStatus: varchar('trial_status', { length: 20 }).default('none'),
    trialStartedAt: timestamp('trial_started_at', { withTimezone: true, mode: 'string' }),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true, mode: 'string' }),
    isGrandfatheredFree: boolean('is_grandfathered_free').default(false),
    lastProcessedInvoiceId: varchar('last_processed_invoice_id', { length: 255 }),
    commitmentType: varchar('commitment_type', { length: 50 }),
    commitmentStartDate: timestamp('commitment_start_date', { withTimezone: true, mode: 'string' }),
    commitmentEndDate: timestamp('commitment_end_date', { withTimezone: true, mode: 'string' }),
    commitmentPriceId: varchar('commitment_price_id', { length: 255 }),
    canCancelAfter: timestamp('can_cancel_after', { withTimezone: true, mode: 'string' }),
    lastRenewalPeriodStart: bigint('last_renewal_period_start', { mode: 'number' }),
    paymentStatus: text('payment_status').default('active'),
    lastPaymentFailure: timestamp('last_payment_failure', { withTimezone: true, mode: 'string' }),
    scheduledTierChange: text('scheduled_tier_change'),
    scheduledTierChangeDate: timestamp('scheduled_tier_change_date', { withTimezone: true, mode: 'string' }),
    scheduledPriceId: text('scheduled_price_id'),
    provider: varchar('provider', { length: 20 }).default('stripe'),
    revenuecatCustomerId: varchar('revenuecat_customer_id', { length: 255 }),
    revenuecatSubscriptionId: varchar('revenuecat_subscription_id', { length: 255 }),
    revenuecatCancelledAt: timestamp('revenuecat_cancelled_at', { withTimezone: true, mode: 'string' }),
    revenuecatCancelAtPeriodEnd: timestamp('revenuecat_cancel_at_period_end', { withTimezone: true, mode: 'string' }),
    revenuecatPendingChangeProduct: text('revenuecat_pending_change_product'),
    revenuecatPendingChangeDate: timestamp('revenuecat_pending_change_date', { withTimezone: true, mode: 'string' }),
    revenuecatPendingChangeType: text('revenuecat_pending_change_type'),
    revenuecatProductId: text('revenuecat_product_id'),
    planType: varchar('plan_type', { length: 50 }).default('monthly'),
    stripeSubscriptionStatus: varchar('stripe_subscription_status', { length: 50 }),
    lastDailyRefresh: timestamp('last_daily_refresh', { withTimezone: true, mode: 'string' }),
    autoTopupEnabled: boolean('auto_topup_enabled').default(false).notNull(),
    autoTopupThreshold: numeric('auto_topup_threshold', { precision: 10, scale: 2 }).default('5').notNull(),
    autoTopupAmount: numeric('auto_topup_amount', { precision: 10, scale: 2 }).default('20').notNull(),
    autoTopupLastCharged: timestamp('auto_topup_last_charged', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('epsilon_credit_accounts_account_id_idx').on(table.accountId),
  ],
);

export const creditLedger = epsilonSchema.table(
  'credit_ledger',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    accountId: uuid('account_id').notNull(),
    amount: numeric('amount', { precision: 12, scale: 4 }).notNull(),
    balanceAfter: numeric('balance_after', { precision: 12, scale: 4 }).notNull(),
    type: text().notNull(),
    description: text(),
    referenceId: uuid('reference_id'),
    referenceType: text('reference_type'),
    metadata: jsonb().default({}),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
    createdBy: uuid('created_by'),
    isExpiring: boolean('is_expiring').default(true),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }),
    stripeEventId: varchar('stripe_event_id', { length: 255 }),
    idempotencyKey: text('idempotency_key'),
    processingSource: text('processing_source'),
  },
  (table) => [
    unique('epsilon_unique_stripe_event').on(table.stripeEventId),
    index('idx_epsilon_credit_ledger_idempotency')
      .on(table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
  ],
);

export const creditUsage = epsilonSchema.table('credit_usage', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  accountId: uuid('account_id').notNull(),
  amountDollars: numeric('amount_dollars', { precision: 10, scale: 2 }).notNull(),
  description: text(),
  usageType: text('usage_type').default('token_overage'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  subscriptionTier: text('subscription_tier'),
  metadata: jsonb().default({}),
});

export const accountDeletionRequests = epsilonSchema.table('account_deletion_requests', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  accountId: uuid('account_id').notNull(),
  userId: uuid('user_id').notNull(),
  status: text().default('pending').notNull(),
  reason: text(),
  requestedAt: timestamp('requested_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true, mode: 'string' }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'string' }),
});

export const creditPurchases = epsilonSchema.table('credit_purchases', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  accountId: uuid('account_id').notNull(),
  amountDollars: numeric('amount_dollars', { precision: 10, scale: 2 }).notNull(),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  stripeChargeId: text('stripe_charge_id'),
  status: text().default('pending').notNull(),
  description: text(),
  metadata: jsonb().default({}),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
  provider: varchar('provider', { length: 50 }).default('stripe'),
  revenuecatTransactionId: varchar('revenuecat_transaction_id', { length: 255 }),
  revenuecatProductId: varchar('revenuecat_product_id', { length: 255 }),
});

// ─── Tunnel (Reverse-Tunnel to Local Machine) ──────────────────────────────

export const tunnelStatusEnum = epsilonSchema.enum('tunnel_status', [
  'online',
  'offline',
  'connecting',
]);

export const tunnelCapabilityEnum = epsilonSchema.enum('tunnel_capability', [
  'filesystem',
  'shell',
  'network',
  'apps',
  'hardware',
  'desktop',
  'gpu',
]);

export const tunnelPermissionStatusEnum = epsilonSchema.enum('tunnel_permission_status', [
  'active',
  'revoked',
  'expired',
]);

export const tunnelPermissionRequestStatusEnum = epsilonSchema.enum('tunnel_permission_request_status', [
  'pending',
  'approved',
  'denied',
  'expired',
]);

/** Machine info reported by the local agent on connect. */
export interface TunnelMachineInfo {
  hostname: string;
  platform: string;
  arch: string;
  osVersion?: string;
  nodeVersion?: string;
  agentVersion?: string;
  [key: string]: unknown;
}

/** Scope shape for filesystem capability. */
export interface TunnelFilesystemScope {
  paths: string[];
  operations: ('read' | 'write' | 'list' | 'delete')[];
  maxFileSize?: number;
  excludePatterns?: string[];
}

/** Scope shape for shell capability. */
export interface TunnelShellScope {
  commands: string[];
  workingDir?: string;
  maxTimeout?: number;
}

/** Scope shape for network capability. */
export interface TunnelNetworkScope {
  ports: number[];
  hosts: string[];
  protocols: ('http' | 'tcp')[];
}

/** Union of all capability scopes. */
export type TunnelPermissionScope =
  | TunnelFilesystemScope
  | TunnelShellScope
  | TunnelNetworkScope
  | Record<string, unknown>;

export const tunnelConnections = epsilonSchema.table(
  'tunnel_connections',
  {
    tunnelId: uuid('tunnel_id').defaultRandom().primaryKey(),
    accountId: uuid('account_id').notNull(),
    sandboxId: uuid('sandbox_id').references(() => sandboxes.sandboxId, { onDelete: 'set null' }),
    name: varchar('name', { length: 255 }).notNull(),
    status: tunnelStatusEnum('status').default('offline').notNull(),
    capabilities: jsonb('capabilities').default([]).$type<string[]>(),
    machineInfo: jsonb('machine_info').default({}).$type<TunnelMachineInfo>(),
    setupTokenHash: varchar('setup_token_hash', { length: 128 }),
    lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_tunnel_connections_account').on(table.accountId),
    index('idx_tunnel_connections_sandbox').on(table.sandboxId),
    index('idx_tunnel_connections_status').on(table.status),
  ],
);

export const tunnelPermissions = epsilonSchema.table(
  'tunnel_permissions',
  {
    permissionId: uuid('permission_id').defaultRandom().primaryKey(),
    tunnelId: uuid('tunnel_id')
      .notNull()
      .references(() => tunnelConnections.tunnelId, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull(),
    capability: tunnelCapabilityEnum('capability').notNull(),
    scope: jsonb('scope').default({}).$type<TunnelPermissionScope>(),
    status: tunnelPermissionStatusEnum('status').default('active').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_tunnel_permissions_tunnel').on(table.tunnelId),
    index('idx_tunnel_permissions_account').on(table.accountId),
    index('idx_tunnel_permissions_capability').on(table.capability),
    index('idx_tunnel_permissions_status').on(table.status),
  ],
);

export const tunnelPermissionRequests = epsilonSchema.table(
  'tunnel_permission_requests',
  {
    requestId: uuid('request_id').defaultRandom().primaryKey(),
    tunnelId: uuid('tunnel_id')
      .notNull()
      .references(() => tunnelConnections.tunnelId, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull(),
    capability: tunnelCapabilityEnum('capability').notNull(),
    requestedScope: jsonb('requested_scope').default({}).$type<TunnelPermissionScope>(),
    reason: text('reason'),
    status: tunnelPermissionRequestStatusEnum('status').default('pending').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_tunnel_perm_requests_tunnel').on(table.tunnelId),
    index('idx_tunnel_perm_requests_account').on(table.accountId),
    index('idx_tunnel_perm_requests_status').on(table.status),
  ],
);

export const tunnelAuditLogs = epsilonSchema.table(
  'tunnel_audit_logs',
  {
    logId: uuid('log_id').defaultRandom().primaryKey(),
    tunnelId: uuid('tunnel_id')
      .notNull()
      .references(() => tunnelConnections.tunnelId, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull(),
    capability: tunnelCapabilityEnum('capability').notNull(),
    operation: varchar('operation', { length: 100 }).notNull(),
    requestSummary: jsonb('request_summary').default({}).$type<Record<string, unknown>>(),
    success: boolean('success').notNull(),
    durationMs: integer('duration_ms'),
    bytesTransferred: integer('bytes_transferred'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_tunnel_audit_tunnel').on(table.tunnelId),
    index('idx_tunnel_audit_account').on(table.accountId),
    index('idx_tunnel_audit_capability').on(table.capability),
    index('idx_tunnel_audit_created').on(table.createdAt),
  ],
);

export const tunnelDeviceAuthStatusEnum = epsilonSchema.enum('tunnel_device_auth_status', [
  'pending',
  'approved',
  'denied',
  'expired',
]);

export const tunnelDeviceAuthRequests = epsilonSchema.table(
  'tunnel_device_auth_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    deviceCode: varchar('device_code', { length: 9 }).notNull(),
    deviceSecretHash: varchar('device_secret_hash', { length: 128 }).notNull(),
    status: tunnelDeviceAuthStatusEnum('status').default('pending').notNull(),
    machineHostname: varchar('machine_hostname', { length: 255 }),
    accountId: uuid('account_id'),
    tunnelId: uuid('tunnel_id').references(() => tunnelConnections.tunnelId, { onDelete: 'set null' }),
    setupToken: varchar('setup_token', { length: 64 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_tunnel_device_auth_code').on(table.deviceCode),
    index('idx_tunnel_device_auth_status').on(table.status),
    index('idx_tunnel_device_auth_expires').on(table.expiresAt),
  ],
);

// ─── Tunnel Relations ────────────────────────────────────────────────────────

export const tunnelConnectionsRelations = relations(tunnelConnections, ({ one, many }) => ({
  account: one(accounts, {
    fields: [tunnelConnections.accountId],
    references: [accounts.accountId],
  }),
  sandbox: one(sandboxes, {
    fields: [tunnelConnections.sandboxId],
    references: [sandboxes.sandboxId],
  }),
  permissions: many(tunnelPermissions),
  permissionRequests: many(tunnelPermissionRequests),
  auditLogs: many(tunnelAuditLogs),
}));

export const tunnelPermissionsRelations = relations(tunnelPermissions, ({ one }) => ({
  tunnel: one(tunnelConnections, {
    fields: [tunnelPermissions.tunnelId],
    references: [tunnelConnections.tunnelId],
  }),
}));

export const tunnelPermissionRequestsRelations = relations(tunnelPermissionRequests, ({ one }) => ({
  tunnel: one(tunnelConnections, {
    fields: [tunnelPermissionRequests.tunnelId],
    references: [tunnelConnections.tunnelId],
  }),
}));

export const tunnelAuditLogsRelations = relations(tunnelAuditLogs, ({ one }) => ({
  tunnel: one(tunnelConnections, {
    fields: [tunnelAuditLogs.tunnelId],
    references: [tunnelConnections.tunnelId],
  }),
}));

// ─── Access Control ─────────────────────────────────────────────────────────

// ─── Platform User Roles ────────────────────────────────────────────────────
// Platform-level roles (not account-scoped). Controls admin access to the platform.

export const platformRoleEnum = epsilonSchema.enum('platform_role', [
  'user',
  'admin',
  'super_admin',
]);

export const platformUserRoles = epsilonSchema.table(
  'platform_user_roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id').notNull(),
    role: platformRoleEnum('role').default('user').notNull(),
    grantedBy: uuid('granted_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_platform_user_roles_account_id').on(table.accountId),
    index('idx_platform_user_roles_role').on(table.role),
  ],
);

// ─── Access Control ─────────────────────────────────────────────────────────

export const accessRequestStatusEnum = epsilonSchema.enum('access_request_status', [
  'pending',
  'approved',
  'rejected',
]);

export const platformSettings = epsilonSchema.table(
  'platform_settings',
  {
    key: varchar('key', { length: 255 }).primaryKey(),
    value: jsonb('value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
);

export const accessAllowlist = epsilonSchema.table(
  'access_allowlist',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entryType: varchar('entry_type', { length: 20 }).notNull(), // 'email' | 'domain'
    value: varchar('value', { length: 255 }).notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_access_allowlist_type_value').on(table.entryType, table.value),
  ],
);

export const accessRequests = epsilonSchema.table(
  'access_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    company: varchar('company', { length: 255 }),
    useCase: text('use_case'),
    status: accessRequestStatusEnum('status').default('pending').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_access_requests_email').on(table.email),
    index('idx_access_requests_status').on(table.status),
  ],
);

// ─── Discover Feed ──────────────────────────────────────────────────────────

export const warningLevelEnum = epsilonSchema.enum('warning_level', [
  'none',
  'low',
  'medium',
  'high',
  'critical',
  'alpha',
]);

export const discoverFeeds = epsilonSchema.table(
  'discover_feeds',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: varchar('title', { length: 500 }).notNull(),
    summary: text('summary').notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
    isAnomaly: boolean('is_anomaly').default(false).notNull(),
    warningLevel: warningLevelEnum('warning_level').default('none').notNull(),
    sources: jsonb('sources').default([]).$type<{ name: string; url?: string }[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_discover_feeds_timestamp').on(table.timestamp),
    index('idx_discover_feeds_anomaly')
      .on(table.timestamp)
      .where(sql`${table.isAnomaly} = true`),
  ]
);

// ─── Protocol Watchlist ──────────────────────────────────────────────────────

export const protocolWatchlist = epsilonSchema.table(
  'protocol_watchlist',
  {
    slug: varchar('slug', { length: 100 }).primaryKey(),
    displayName: varchar('display_name', { length: 255 }).notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
);

// ─── Protocol TVL Snapshots ──────────────────────────────────────────────────

export const protocolTvlSnapshots = epsilonSchema.table(
  'protocol_tvl_snapshots',
  {
    slug: varchar('slug', { length: 100 }).primaryKey(),
    displayName: varchar('display_name', { length: 255 }).notNull(),
    tvlUsd: numeric('tvl_usd', { precision: 20, scale: 4 }).notNull(),
    tvlChange24hPct: numeric('tvl_change_24h_pct', { precision: 10, scale: 4 }),
    apyAvg: numeric('apy_avg', { precision: 10, scale: 4 }),
    chains: jsonb('chains').notNull().default([]).$type<string[]>(),
    rawSnapshot: text('raw_snapshot'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_protocol_snapshots_updated').on(table.updatedAt),
  ],
);

// ─── On-Chain Data ──────────────────────────────────────────────────────────

export const onchainSourceEnum = epsilonSchema.enum('onchain_source', ['dune', 'nansen']);

export const onChainDataIndex = epsilonSchema.table(
  'onchain_data_index',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    source: onchainSourceEnum('source').notNull(),
    walletAddress: varchar('wallet_address', { length: 512 }),
    tokenAddress: varchar('token_address', { length: 512 }),
    metricName: varchar('metric_name', { length: 255 }).notNull(),
    metricValue: jsonb('metric_value').notNull().$type<Record<string, unknown>>(),
    timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_onchain_data_source_ts').on(table.source, table.timestamp),
    index('idx_onchain_data_timestamp').on(table.timestamp),
    index('idx_onchain_data_wallet')
      .on(table.walletAddress)
      .where(sql`${table.walletAddress} IS NOT NULL`),
    index('idx_onchain_data_token')
      .on(table.tokenAddress)
      .where(sql`${table.tokenAddress} IS NOT NULL`),
    uniqueIndex('uq_onchain_natural').on(
      table.source,
      table.metricName,
      table.timestamp,
      table.walletAddress,
      table.tokenAddress,
    ),
  ]
);

// ─── Social Sentiment (Story 2.2.2) ─────────────────────────────────────────

export const narrativeCategoryEnum = epsilonSchema.enum('narrative_category', [
  'ai',
  'rwa',
  'memes',
  'depin',
  'gaming',
  'l1',
  'l2',
  'defi',
  'privacy',
  'other',
]);

export const tokenSocialSignals = epsilonSchema.table(
  'token_social_signals',
  {
    slug: varchar('slug', { length: 100 }).primaryKey(),
    symbol: varchar('symbol', { length: 20 }).notNull(),
    narrative: narrativeCategoryEnum('narrative').default('other').notNull(),
    socialVolume24h: numeric('social_volume_24h', { precision: 20, scale: 4 }),
    socialVolumeChange24hPct: numeric('social_volume_change_24h_pct', { precision: 10, scale: 4 }),
    socialDominancePct: numeric('social_dominance_pct', { precision: 10, scale: 4 }),
    sentimentScore: numeric('sentiment_score', { precision: 10, scale: 4 }),
    priceUsd: numeric('price_usd', { precision: 20, scale: 8 }),
    priceChange24hPct: numeric('price_change_24h_pct', { precision: 10, scale: 4 }),
    isAlphaSignal: boolean('is_alpha_signal').default(false).notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_token_social_narrative').on(table.narrative),
    index('idx_token_social_alpha')
      .on(table.isAlphaSignal, table.socialVolumeChange24hPct)
      .where(sql`${table.isAlphaSignal} = true`),
  ]
);

// ─── Mempool Alerts (Story 2.1.1) ───────────────────────────────────────────

export const mempoolAlerts = epsilonSchema.table(
  'mempool_alerts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    chain: varchar('chain', { length: 32 }).notNull(),
    provider: varchar('provider', { length: 50 }).notNull(),
    txHash: varchar('tx_hash', { length: 100 }).notNull(),
    fromAddress: varchar('from_address', { length: 100 }),
    toAddress: varchar('to_address', { length: 100 }),
    routerAddress: varchar('router_address', { length: 100 }),
    methodSelector: varchar('method_selector', { length: 10 }),
    alertType: varchar('alert_type', { length: 50 }).notNull(),
    estimatedValueUsd: numeric('estimated_value_usd', { precision: 20, scale: 4 }),
    nativeValueWei: text('native_value_wei'),
    tokenIn: varchar('token_in', { length: 100 }),
    tokenOut: varchar('token_out', { length: 100 }),
    // AC4: persist gas limit + chainId alongside fee fields. Stored as string to
    // preserve full BigInt precision (hex/dec form from the provider).
    gasLimit: varchar('gas_limit', { length: 100 }),
    chainIdHex: varchar('chain_id', { length: 20 }),
    gasPriceWei: text('gas_price_wei'),
    rawTx: jsonb('raw_tx').notNull().default({}).$type<Record<string, unknown>>(),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    detectedAt: timestamp('detected_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Composite (chain, txHash) — a hash is only unique per chain. Prevents cross-chain
    // collisions from silently overwriting one another via onConflictDoUpdate.
    uniqueIndex('uq_mempool_alerts_chain_tx_hash').on(table.chain, table.txHash),
    index('idx_mempool_alerts_detected_at').on(table.detectedAt),
    index('idx_mempool_alerts_chain_detected').on(table.chain, table.detectedAt),
    index('idx_mempool_alerts_alert_type').on(table.alertType),
    index('idx_mempool_alerts_pending').on(table.status).where(sql`${table.status} = 'pending'`),
  ],
);

// ─── Entity Wallet Labels (Story 2.1.2) ──────────────────────────────────────

export const entityWalletLabels = epsilonSchema.table(
  'entity_wallet_labels',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    chain: varchar('chain', { length: 32 }).notNull(),
    address: varchar('address', { length: 128 }).notNull(),
    entityId: varchar('entity_id', { length: 255 }),
    entityName: varchar('entity_name', { length: 255 }),
    entityType: varchar('entity_type', { length: 100 }),
    label: varchar('label', { length: 255 }),
    tags: jsonb('tags').default([]).$type<string[]>(),
    confidence: numeric('confidence', { precision: 6, scale: 4 }),
    riskCategory: varchar('risk_category', { length: 64 }),
    riskScore: integer('risk_score'),
    source: varchar('source', { length: 50 }).notNull().default('arkham'),
    rawResponse: jsonb('raw_response').$type<Record<string, unknown>>(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_entity_wallet_labels_chain_addr_src').on(table.chain, table.address, table.source),
    index('idx_entity_wallet_labels_address').on(table.address),
    index('idx_entity_wallet_labels_entity').on(table.entityId),
    index('idx_entity_wallet_labels_risk').on(table.riskCategory),
    index('idx_entity_wallet_labels_updated').on(table.updatedAt),
  ],
);

export const tokenHolderEntityRisks = epsilonSchema.table(
  'token_holder_entity_risks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    chain: varchar('chain', { length: 32 }).notNull(),
    tokenAddress: varchar('token_address', { length: 128 }).notNull(),
    holderCount: integer('holder_count'),
    labeledHolderCount: integer('labeled_holder_count'),
    riskyHolderCount: integer('risky_holder_count'),
    topEntities: jsonb('top_entities').default([]).$type<Record<string, unknown>[]>(),
    riskFactors: jsonb('risk_factors').default([]).$type<Record<string, unknown>[]>(),
    riskScore: integer('risk_score'),
    riskLevel: varchar('risk_level', { length: 32 }),
    source: varchar('source', { length: 50 }).notNull().default('arkham'),
    analysisStatus: varchar('analysis_status', { length: 32 }).notNull().default('complete'),
    rawSummary: jsonb('raw_summary').$type<Record<string, unknown>>(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_token_holder_entity_risks_chain_token_src').on(table.chain, table.tokenAddress, table.source),
    index('idx_token_holder_entity_risks_token').on(table.tokenAddress),
    index('idx_token_holder_entity_risks_risk').on(table.riskLevel),
    index('idx_token_holder_entity_risks_updated').on(table.updatedAt),
  ],
);

export const entityWalletWatchlist = epsilonSchema.table(
  'entity_wallet_watchlist',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    chain: varchar('chain', { length: 32 }).notNull(),
    address: varchar('address', { length: 128 }).notNull(),
    label: varchar('label', { length: 255 }),
    notes: text('notes'),
    addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_entity_wallet_watchlist_chain_addr').on(table.chain, table.address),
    index('idx_entity_wallet_watchlist_address').on(table.address),
  ],
);

// ─── Project Wallet Watchlist (Story 2.2.1) ─────────────────────────────────

export const projectWalletWatchlist = epsilonSchema.table(
  'project_wallet_watchlist',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    chain: varchar('chain', { length: 32 }).notNull(),
    tokenAddress: varchar('token_address', { length: 128 }).notNull(),
    tokenSymbol: varchar('token_symbol', { length: 32 }),
    projectSlug: varchar('project_slug', { length: 128 }),
    walletAddress: varchar('wallet_address', { length: 128 }).notNull(),
    walletRole: varchar('wallet_role', { length: 32 }).notNull().default('unknown'),
    label: text('label'),
    source: varchar('source', { length: 64 }).notNull().default('manual'),
    confidence: numeric('confidence', { precision: 5, scale: 4 }),
    active: boolean('active').notNull().default(true),
    metadata: jsonb('metadata').notNull().default({}).$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_project_wallet_watchlist_chain_token_wallet').on(table.chain, table.tokenAddress, table.walletAddress),
    index('idx_project_wallet_watchlist_chain_token_active').on(table.chain, table.tokenAddress, table.active),
    index('idx_project_wallet_watchlist_wallet_address').on(table.walletAddress),
  ],
);

// ─── On-chain Fact Checks (Story 2.2.1) ─────────────────────────────────────

export const onchainFactChecks = epsilonSchema.table(
  'onchain_fact_checks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    discoverFeedId: uuid('discover_feed_id'),
    chain: varchar('chain', { length: 32 }).notNull(),
    tokenAddress: varchar('token_address', { length: 128 }).notNull(),
    tokenSymbol: varchar('token_symbol', { length: 32 }),
    articleTitle: text('article_title'),
    articleSentiment: varchar('article_sentiment', { length: 32 }).notNull().default('unknown'),
    status: varchar('status', { length: 32 }).notNull().default('skipped'),
    walletsChecked: integer('wallets_checked').notNull().default(0),
    netOutflowPct: numeric('net_outflow_pct', { precision: 10, scale: 4 }),
    largestWalletOutflowPct: numeric('largest_wallet_outflow_pct', { precision: 10, scale: 4 }),
    transferCount: integer('transfer_count').notNull().default(0),
    riskLevel: warningLevelEnum('risk_level').notNull().default('none'),
    riskFactors: jsonb('risk_factors').notNull().default([]).$type<Record<string, unknown>[]>(),
    evidence: jsonb('evidence').notNull().default({}).$type<Record<string, unknown>>(),
    checkedAt: timestamp('checked_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_onchain_fact_checks_chain_token_checked').on(table.chain, table.tokenAddress, table.checkedAt),
    index('idx_onchain_fact_checks_status_checked').on(table.status, table.checkedAt),
    index('idx_onchain_fact_checks_risk_checked').on(table.riskLevel, table.checkedAt),
  ],
);

// ─── Nansen Smart Money Flows (Story 2.3.1) ──────────────────────────────────

export const nansenSmartMoneyFlows = epsilonSchema.table(
  'nansen_smart_money_flows',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    chain: varchar('chain', { length: 32 }).notNull(),
    tokenAddress: varchar('token_address', { length: 128 }).notNull(),
    tokenSymbol: varchar('token_symbol', { length: 64 }),
    // metric_type: holdings | netflow | tgm_who_bought | tgm_who_sold | tgm_flow_smart_money | tgm_flow_exchange
    metricType: varchar('metric_type', { length: 64 }).notNull(),
    // time_window: 1h | 24h | 7d
    timeWindow: varchar('time_window', { length: 32 }).notNull(),
    // direction: inflow | outflow | buy | sell | neutral
    direction: varchar('direction', { length: 32 }),
    amountUsd: numeric('amount_usd', { precision: 24, scale: 4 }),
    netFlowUsd: numeric('net_flow_usd', { precision: 24, scale: 4 }),
    walletCount: integer('wallet_count'),
    traderCount: integer('trader_count'),
    topWallets: jsonb('top_wallets').notNull().default([]).$type<Record<string, unknown>[]>(),
    flowBreakdown: jsonb('flow_breakdown').notNull().default({}).$type<Record<string, unknown>>(),
    riskFactors: jsonb('risk_factors').notNull().default([]).$type<Record<string, unknown>[]>(),
    source: varchar('source', { length: 32 }).notNull().default('nansen'),
    providerCreditCost: integer('provider_credit_cost'),
    cacheExpiresAt: timestamp('cache_expires_at', { withTimezone: true }).notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_nansen_flows_token_time').on(table.chain, table.tokenAddress, table.metricType, table.fetchedAt),
    index('idx_nansen_flows_expires').on(table.cacheExpiresAt),
    uniqueIndex('uq_nansen_flows_chain_token_metric_window_source').on(table.chain, table.tokenAddress, table.metricType, table.timeWindow, table.source),
  ],
);

// ─── Nansen Token God Mode Cache (Story 2.3.1) ───────────────────────────────

export const nansenTokenGodModeCache = epsilonSchema.table(
  'nansen_token_god_mode_cache',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    chain: varchar('chain', { length: 32 }).notNull(),
    tokenAddress: varchar('token_address', { length: 128 }).notNull(),
    tokenSymbol: varchar('token_symbol', { length: 64 }),
    summary: jsonb('summary').notNull().default({}).$type<Record<string, unknown>>(),
    topBuyers: jsonb('top_buyers').notNull().default([]).$type<Record<string, unknown>[]>(),
    topSellers: jsonb('top_sellers').notNull().default([]).$type<Record<string, unknown>[]>(),
    smartMoneyFlows: jsonb('smart_money_flows').notNull().default({}).$type<Record<string, unknown>>(),
    exchangeFlows: jsonb('exchange_flows').notNull().default({}).$type<Record<string, unknown>>(),
    // status: queued | complete | partial | provider_unavailable | rate_limited | forbidden
    status: varchar('status', { length: 32 }).notNull().default('complete'),
    source: varchar('source', { length: 32 }).notNull().default('nansen'),
    providerCreditCost: integer('provider_credit_cost'),
    cacheExpiresAt: timestamp('cache_expires_at', { withTimezone: true }).notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_nansen_tgm_token').on(table.chain, table.tokenAddress),
    index('idx_nansen_tgm_expires').on(table.cacheExpiresAt),
    uniqueIndex('uq_nansen_tgm_chain_token_source').on(table.chain, table.tokenAddress, table.source),
  ],
);

// ─── Token Terminal Fundamentals (Story 2.3.2) ─────────────────────────────

export const tokenTerminalProjects = epsilonSchema.table(
  'token_terminal_projects',
  {
    projectId: varchar('project_id', { length: 128 }).primaryKey(),
    projectName: varchar('project_name', { length: 255 }).notNull(),
    symbol: varchar('symbol', { length: 64 }),
    marketSector: varchar('market_sector', { length: 128 }),
    websiteUrl: text('website_url'),
    tokenAddresses: jsonb('token_addresses').notNull().default([]).$type<string[]>(),
    metadata: jsonb('metadata').notNull().default({}).$type<Record<string, unknown>>(),
    source: varchar('source', { length: 32 }).notNull().default('token_terminal'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
);

export const tokenTerminalMetrics = epsilonSchema.table(
  'token_terminal_metrics',
  {
    metricId: varchar('metric_id', { length: 128 }).primaryKey(),
    metricName: varchar('metric_name', { length: 255 }).notNull(),
    description: text('description'),
    url: text('url'),
    metadata: jsonb('metadata').notNull().default({}).$type<Record<string, unknown>>(),
    source: varchar('source', { length: 32 }).notNull().default('token_terminal'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
);

export const tokenTerminalProjectMetrics = epsilonSchema.table(
  'token_terminal_project_metrics',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: varchar('project_id', { length: 128 }).notNull(),
    projectName: varchar('project_name', { length: 255 }),
    metricId: varchar('metric_id', { length: 128 }).notNull(),
    metricName: varchar('metric_name', { length: 255 }),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    value: numeric('value', { precision: 30, scale: 8 }),
    rawValue: text('raw_value'),
    source: varchar('source', { length: 32 }).notNull().default('token_terminal'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_token_terminal_project_metrics_p_m_t_s').on(table.projectId, table.metricId, table.timestamp, table.source),
    index('idx_token_terminal_project_metrics_pm_ts').on(table.projectId, table.metricId, table.timestamp),
    index('idx_token_terminal_project_metrics_m_ts').on(table.metricId, table.timestamp),
  ],
);

export const tokenTerminalValuationSnapshots = epsilonSchema.table(
  'token_terminal_valuation_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: varchar('project_id', { length: 128 }).notNull(),
    projectName: varchar('project_name', { length: 255 }),
    symbol: varchar('symbol', { length: 64 }),
    sector: varchar('sector', { length: 128 }),
    feesAnnualizedUsd: numeric('fees_annualized_usd', { precision: 30, scale: 4 }),
    revenueAnnualizedUsd: numeric('revenue_annualized_usd', { precision: 30, scale: 4 }),
    earningsAnnualizedUsd: numeric('earnings_annualized_usd', { precision: 30, scale: 4 }),
    marketCapFullyDilutedUsd: numeric('market_cap_fully_diluted_usd', { precision: 30, scale: 4 }),
    marketCapCirculatingUsd: numeric('market_cap_circulating_usd', { precision: 30, scale: 4 }),
    psRatioFullyDiluted: numeric('ps_ratio_fully_diluted', { precision: 20, scale: 6 }),
    psRatioCirculating: numeric('ps_ratio_circulating', { precision: 20, scale: 6 }),
    pfRatioFullyDiluted: numeric('pf_ratio_fully_diluted', { precision: 20, scale: 6 }),
    pfRatioCirculating: numeric('pf_ratio_circulating', { precision: 20, scale: 6 }),
    peRatio: numeric('pe_ratio', { precision: 20, scale: 6 }),
    userDau: integer('user_dau'),
    activeDevelopers: integer('active_developers'),
    codeCommits: integer('code_commits'),
    valuationSignal: varchar('valuation_signal', { length: 32 }).notNull().default('unknown'),
    peerPercentiles: jsonb('peer_percentiles').notNull().default({}).$type<Record<string, unknown>>(),
    riskFactors: jsonb('risk_factors').notNull().default([]).$type<string[]>(),
    source: varchar('source', { length: 32 }).notNull().default('token_terminal'),
    periodStart: timestamp('period_start', { withTimezone: true }),
    periodEnd: timestamp('period_end', { withTimezone: true }),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_token_terminal_valuation_snapshots_p_pe_s').on(table.projectId, table.periodEnd, table.source),
    index('idx_token_terminal_valuation_snapshots_sector_period').on(table.sector, table.periodEnd),
    index('idx_token_terminal_valuation_snapshots_signal_period').on(table.valuationSignal, table.periodEnd),
    index('idx_token_terminal_valuation_snapshots_ps_fd').on(table.psRatioFullyDiluted),
    index('idx_token_terminal_valuation_snapshots_user_dau').on(table.userDau),
  ],
);
