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
