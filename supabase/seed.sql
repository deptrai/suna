INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at) VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'test@test.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', false, now(), now()) ON CONFLICT DO NOTHING;
INSERT INTO public.basejump_users (id, role) VALUES ('00000000-0000-0000-0000-000000000000', 'owner') ON CONFLICT DO NOTHING;

