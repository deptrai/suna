#!/usr/bin/env python3
"""
Script to create account record for a user in basejump.accounts table
"""

import asyncio
import sys
import os
from typing import Optional

# Add the backend directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

from dotenv import load_dotenv
from core.services.supabase import DBConnection
from core.utils.logger import logger

load_dotenv()

async def create_account_for_user(user_id: str, name: str = "Test User", slug: Optional[str] = None):
    """
    Create an account record for a user in basejump.accounts table

    Args:
        user_id: The UUID of the user
        name: The name for the account
        slug: The slug for the account (optional)
    """
    try:
        # Get database connection
        db = DBConnection()
        client = await db.client

        # First, try to create account using direct insert
        # This bypasses RLS since we're using service role
        import asyncpg
        import os

        # Get connection string from environment
        supabase_url = os.getenv('SUPABASE_URL', 'http://127.0.0.1:54321')
        supabase_service_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

        # For local development, use direct PostgreSQL connection
        db_url = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

        # Connect directly to PostgreSQL
        conn = await asyncpg.connect(db_url)

        try:
            # Insert into basejump.accounts
            account_query = '''
            INSERT INTO basejump.accounts (id, name, slug, personal_account, primary_owner_user_id, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                slug = EXCLUDED.slug,
                updated_at = NOW()
            RETURNING id, name, slug, personal_account, primary_owner_user_id, created_at, updated_at;
            '''

            account_result = await conn.fetchrow(account_query, user_id, name, slug, True, user_id)

            if account_result:
                # Also insert into account_user table
                user_query = '''
                INSERT INTO basejump.account_user (user_id, account_id, account_role)
                VALUES ($1, $2, $3)
                ON CONFLICT (user_id, account_id) DO NOTHING;
                '''

                await conn.execute(user_query, user_id, user_id, 'owner')

                result_dict = dict(account_result)
                logger.info(f"✅ Account created successfully for user {user_id}: {result_dict}")
                return result_dict
            else:
                logger.error(f"❌ Failed to create account for user {user_id}")
                return None

        finally:
            await conn.close()

    except Exception as e:
        logger.error(f"Error creating account for user {user_id}: {e}")
        import traceback
        traceback.print_exc()
        return None

async def main():
    """Main function to run the script"""
    if len(sys.argv) < 2:
        print("Usage: python create_account_for_user.py <user_id> [name] [slug]")
        print("Example: python create_account_for_user.py a8d11115-e741-4d96-8a1e-74c23a389670 'Test User' 'test-user'")
        sys.exit(1)
    
    user_id = sys.argv[1]
    name = sys.argv[2] if len(sys.argv) > 2 else "Test User"
    slug = sys.argv[3] if len(sys.argv) > 3 else None
    
    logger.info(f"Creating account for user: {user_id}")
    logger.info(f"Account name: {name}")
    logger.info(f"Account slug: {slug}")
    
    result = await create_account_for_user(user_id, name, slug)
    
    if result:
        print(f"✅ Account created successfully!")
        print(f"Account ID: {result.get('id', 'N/A')}")
        print(f"Account Name: {result.get('name', 'N/A')}")
        print(f"Account Slug: {result.get('slug', 'N/A')}")
    else:
        print("❌ Failed to create account")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
