// Main exports
export { createDb, type Database } from './client';
export * as schema from './schema';

// Re-export frequently used schemas and types for convenience
export {
  // Schema namespace
  epsilonSchema,
  // Enums
  sandboxStatusEnum,
  deploymentStatusEnum,
  deploymentSourceEnum,
  apiKeyStatusEnum,
  apiKeyTypeEnum,
  // Epsilon tables — accounts
  accounts,
  accountMembers,
  accountRoleEnum,
  accountsRelations,
  accountMembersRelations,
  // Epsilon tables
  sandboxes,
  sandboxMembers,
  sandboxMemberScopes,
  scopeEffectEnum,
  sandboxInvites,
  deployments,
  epsilonApiKeys,
  integrationCredentials,
  integrations,
  sandboxIntegrations,
  serverEntries,
  // Enums (integrations)
  integrationStatusEnum,
  // Relations
  sandboxesRelations,
  sandboxMembersRelations,
  sandboxInvitesRelations,
  deploymentsRelations,
  epsilonApiKeysRelations,
  integrationsRelations,
  sandboxIntegrationsRelations,
  // Billing / Credits (moved from public → epsilon schema)
  billingCustomers,
  creditAccounts,
  creditLedger,
  creditUsage,
  accountDeletionRequests,
  creditPurchases,
  // Tunnel
  tunnelStatusEnum,
  tunnelCapabilityEnum,
  tunnelPermissionStatusEnum,
  tunnelPermissionRequestStatusEnum,
  tunnelConnections,
  tunnelPermissions,
  tunnelPermissionRequests,
  tunnelAuditLogs,
  tunnelDeviceAuthStatusEnum,
  tunnelDeviceAuthRequests,
  tunnelConnectionsRelations,
  tunnelPermissionsRelations,
  tunnelPermissionRequestsRelations,
  tunnelAuditLogsRelations,
  // OAuth2 Provider
  oauthClients,
  oauthAuthorizationCodes,
  oauthAccessTokens,
  oauthRefreshTokens,
  // Platform User Roles
  platformRoleEnum,
  platformUserRoles,
  // Access Control
  accessRequestStatusEnum,
  platformSettings,
  accessAllowlist,
  accessRequests,
  // Discover Feeds
  discoverFeeds,
  warningLevelEnum,
  // On-Chain Data
  onChainDataIndex,
  onchainSourceEnum,
  // Protocol TVL (Crypto Worker)
  protocolWatchlist,
  protocolTvlSnapshots,
  // Social Sentiment (Story 2.2.2)
  narrativeCategoryEnum,
  tokenSocialSignals,
  // Pool
  poolResources,
  poolSandboxes,
} from './schema/epsilon';

export type {
  TunnelMachineInfo,
  TunnelFilesystemScope,
  TunnelShellScope,
  TunnelNetworkScope,
  TunnelPermissionScope,
} from './schema/epsilon';

// Public/basejump tables
export {
  apiKeys,
  accountUser,
  billingCustomersInBasejump,
} from './schema/public';

export type {
  Account,
  AccountMember,
  NewAccount,
  NewAccountMember,
  Sandbox,
  NewSandbox,
  ApiKey,
  CreditAccount,
  AccountUser,
  NewApiKey,
  SandboxSelect,
  EpsilonApiKey,
  NewEpsilonApiKey,
  IntegrationCredential,
  NewIntegrationCredential,
  Integration,
  NewIntegration,
  SandboxIntegration,
  NewSandboxIntegration,
  ServerEntry,
  NewServerEntry,
  TunnelConnection,
  NewTunnelConnection,
  TunnelPermission,
  NewTunnelPermission,
  TunnelPermissionRequest,
  NewTunnelPermissionRequest,
  TunnelAuditLog,
  NewTunnelAuditLog,
} from './types';
