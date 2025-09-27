-- Create function to create account for user (bypassing RLS)
CREATE OR REPLACE FUNCTION public.create_account_for_user(
    user_id UUID,
    account_name TEXT DEFAULT 'Test User',
    account_slug TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_account_id UUID;
    result JSON;
BEGIN
    -- Insert into basejump.accounts table
    INSERT INTO basejump.accounts (
        id,
        name,
        slug,
        personal_account,
        primary_owner_user_id,
        created_at,
        updated_at
    )
    VALUES (
        user_id,
        account_name,
        account_slug,
        true,
        user_id,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        updated_at = NOW()
    RETURNING id INTO new_account_id;
    
    -- Also insert into account_user table
    INSERT INTO basejump.account_user (
        user_id,
        account_id,
        account_role
    )
    VALUES (
        user_id,
        new_account_id,
        'owner'
    )
    ON CONFLICT (user_id, account_id) DO NOTHING;
    
    -- Return the created account info
    SELECT json_build_object(
        'id', a.id,
        'name', a.name,
        'slug', a.slug,
        'personal_account', a.personal_account,
        'primary_owner_user_id', a.primary_owner_user_id,
        'created_at', a.created_at,
        'updated_at', a.updated_at
    )
    INTO result
    FROM basejump.accounts a
    WHERE a.id = new_account_id;
    
    RETURN result;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to create account: %', SQLERRM;
END;
$$;

-- Grant execute permission to service_role
GRANT EXECUTE ON FUNCTION public.create_account_for_user(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_account_for_user(UUID, TEXT, TEXT) TO authenticated;
