INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, aud, role, confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current)
VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'test@test.com', crypt('password123', gen_salt('bf', 10)), now(), '{"provider":"email","providers":["email"]}', '{}', false, now(), now(), 'authenticated', 'authenticated', '', '', '', '', '')
ON CONFLICT DO NOTHING;
INSERT INTO epsilon.accounts (account_id, name, personal_account, created_at, updated_at) VALUES ('00000000-0000-0000-0000-000000000000', 'Test User', true, now(), now()) ON CONFLICT DO NOTHING;
INSERT INTO epsilon.account_members (user_id, account_id, account_role, joined_at) VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'owner', now()) ON CONFLICT DO NOTHING;

-- Local dev sandbox for epsilon agent (matches EPSILON_TOKEN in core/docker/.env)
INSERT INTO epsilon.sandboxes (sandbox_id, account_id, name, provider, status, base_url, created_at, updated_at)
VALUES ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'Local Dev Sandbox', 'local_docker', 'active', 'http://localhost:3002', now(), now())
ON CONFLICT DO NOTHING;

-- HMAC-SHA256("development_secret_key", "epsilon_sb_8p7h93ghopItBSbdIF5wMxvCfufFwB6G")
INSERT INTO epsilon.api_keys (key_id, sandbox_id, account_id, public_key, secret_key_hash, title, type, status, created_at)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000000',
  'epsilon_sb_pUxkDw5g1ZNTDKHXbW1KusWk5mq5h6l7',
  '1f9a2acec2f0dfd46e37f2164e52bbf098782a9c6428c4f2717b202f32acbe5c',
  'Local Dev Sandbox',
  'sandbox',
  'active',
  now()
)
ON CONFLICT DO NOTHING;

-- Running epsilon-sandbox container (docker name: epsilon-sandbox, port 14000 → 8000)
-- Proxied at http://localhost:8008/v1/p/epsilon-sandbox/8000
-- EPSILON_TOKEN inside container = epsilon_sb_v3Gfy1KcNu6OuIB9KSExdjVq69gzT09y
-- HMAC-SHA256("development_secret_key", "epsilon_sb_v3Gfy1KcNu6OuIB9KSExdjVq69gzT09y") = 15808d35...
INSERT INTO epsilon.sandboxes (sandbox_id, account_id, name, provider, status, base_url, created_at, updated_at)
VALUES ('bd468317-8f02-442a-bc3c-33f464ab7cab', '00000000-0000-0000-0000-000000000000', 'epsilon-sandbox', 'local_docker', 'active', 'http://localhost:8008/v1/p/epsilon-sandbox/8000', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO epsilon.api_keys (key_id, sandbox_id, account_id, public_key, secret_key_hash, title, type, status, created_at)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  'bd468317-8f02-442a-bc3c-33f464ab7cab',
  '00000000-0000-0000-0000-000000000000',
  'epsilon_sb_v3Gfy1KcNu6OuIB9KSExdjVq69gzT09y',
  '15808d3503506099321af37ed80f9b4a58336e4555117351c56cce0773f1201c',
  'Container Sandbox Token',
  'sandbox',
  'active',
  now()
)
ON CONFLICT DO NOTHING;

-- Bootstrap token (loaded by epsilon-master at startup from .persistent-system/secrets/.bootstrap-env.json)
-- HMAC-SHA256("development_secret_key", "epsilon_sb_bbj15lnoDhHcTS8RFcbthP11aeMHaD1R") = f006fb7a...
INSERT INTO epsilon.api_keys (key_id, sandbox_id, account_id, public_key, secret_key_hash, title, type, status, created_at)
VALUES (
  '44444444-4444-4444-4444-444444444444',
  'bd468317-8f02-442a-bc3c-33f464ab7cab',
  '00000000-0000-0000-0000-000000000000',
  'epsilon_sb_bbj15lnoDhHcTS8RFcbthP11aeMHaD1R',
  'f006fb7a975b213c0e10a395e7180feab929ff2b1558e811b9d72717319acdd3',
  'Bootstrap Token',
  'sandbox',
  'active',
  now()
)
ON CONFLICT DO NOTHING;

-- OpenCode-epsilon serve process token (loaded from s6 env dir at startup)
-- This is the EPSILON_TOKEN the opencode-epsilon process actually uses to call /v1/router/* tool endpoints.
-- Different from the bootstrap token because s6 env dir may have been written separately.
-- HMAC-SHA256("development_secret_key", "epsilon_sb_rWpllyxzeisIWxDhZI63JTaNTNrqH8Xu") = f18f70cd...
INSERT INTO epsilon.api_keys (key_id, sandbox_id, account_id, public_key, secret_key_hash, title, type, status, created_at)
VALUES (
  '55555555-5555-5555-5555-555555555555',
  'bd468317-8f02-442a-bc3c-33f464ab7cab',
  '00000000-0000-0000-0000-000000000000',
  'epsilon_sb_rWpllyxzeisIWxDhZI63JTaNTNrqH8Xu',
  'f18f70cd40e880e23f8852988ee982f124e231906856a89821a67f952b531da4',
  'OpenCode Serve Runtime Token',
  'sandbox',
  'active',
  now()
)
ON CONFLICT DO NOTHING;
