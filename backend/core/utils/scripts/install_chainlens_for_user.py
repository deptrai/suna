#!/usr/bin/env python3
"""
ChainLens Agent Installation Script for Individual Users

Simple script to install ChainLens agents for users by email address or account ID.

Usage:
    # Install ChainLens for a user by email
    python install_chainlens_for_user.py user@example.com
    
    # Install ChainLens for a user by account ID
    python install_chainlens_for_user.py abc123-def456-ghi789
    
    # Install with replacement (if agent already exists)
    python install_chainlens_for_user.py user@example.com --replace
    
    # Explicitly specify account ID
    python install_chainlens_for_user.py abc123-def456-ghi789 --account-id

Examples:
    python install_chainlens_for_user.py john.doe@company.com
    python install_chainlens_for_user.py admin@example.org --replace
    python install_chainlens_for_user.py f47ac10b-58cc-4372-a567-0e02b2c3d479
    python install_chainlens_for_user.py f47ac10b-58cc-4372-a567-0e02b2c3d479 --replace
"""

import asyncio
import argparse
import sys
from pathlib import Path
from typing import Optional, Dict, Any

backend_dir = Path(__file__).parent.parent.parent
sys.path.insert(0, str(backend_dir))

from core.utils.chainlens_default_agent_service import ChainLensDefaultAgentService
from core.services.supabase import DBConnection
from core.utils.logger import logger


class ChainLensUserInstaller:
    def __init__(self):
        self.db = DBConnection()
        self.service = ChainLensDefaultAgentService(self.db)
    
    async def initialize(self):
        await self.db.initialize()
    
    async def get_account_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        try:
            client = await self.db.client
            
            email_result = await client.schema('basejump').from_('billing_customers').select(
                'account_id'
            ).eq('email', email).execute()
            
            if email_result.data:
                account_id = email_result.data[0]['account_id']
                
                account_result = await client.schema('basejump').from_('accounts').select(
                    'id, name, slug, primary_owner_user_id'
                ).eq('id', account_id).execute()
                
                if account_result.data:
                    return account_result.data[0]
            
            try:
                result = await client.rpc('get_user_account_by_email', {
                    'email_input': email.lower()
                }).execute()
                
                if result.data:
                    return result.data
                    
            except Exception as e:
                logger.debug(f"RPC function not available: {e}")
            
            result = await client.schema('basejump').table('accounts').select(
                'id',
                'name', 
                'slug',
                'primary_owner_user_id'
            ).eq('personal_account', True).execute()
            
            if not result.data:
                return None

            email_prefix = email.split('@')[0].lower()
            
            for account in result.data:
                account_name = account.get('name') or ''
                account_slug = account.get('slug') or ''
                
                if account_name.lower() == email_prefix or \
                   account_slug.lower() == email_prefix:
                    return account
            
            email_prefix_normalized = email_prefix.replace('.', '').replace('-', '').replace('_', '')
            for account in result.data:
                account_name = (account.get('name') or '').lower().replace('.', '').replace('-', '').replace('_', '')
                account_slug = (account.get('slug') or '').lower().replace('.', '').replace('-', '').replace('_', '')
                
                if account_name == email_prefix_normalized or account_slug == email_prefix_normalized:
                    return account
            
            return None
            
        except Exception as e:
            logger.error(f"Error looking up account by email: {e}")
            raise
    
    async def install_for_email(self, email: str, replace: bool = False):
        print(f"🔍 Looking for account with email: {email}")
        
        account = await self.get_account_by_email(email)
        if not account:
            print(f"❌ No account found for email: {email}")
            print(f"   Make sure the user has signed up and has a personal account")
            return
        
        account_id = account['id']
        print(f"✅ Found account: {account['name']} ({account_id})")
        
        print(f"🚀 Installing ChainLens agent...")
        agent_id = await self.service.install_chainlens_agent_for_user(
            account_id, 
            replace_existing=replace
        )
        
        if agent_id:
            print(f"✅ Successfully installed ChainLens agent!")
            print(f"   🤖 Agent ID: {agent_id}")
            print(f"   👤 User: {email}")
            print(f"   📦 Account: {account_id}")
        else:
            print(f"❌ Failed to install ChainLens agent for {email}")
    
    async def install_for_account_id(self, account_id: str, replace: bool = False):
        print(f"🚀 Installing ChainLens agent for account: {account_id}")
        
        try:
            agent_id = await self.service.install_chainlens_agent_for_user(
                account_id, 
                replace_existing=replace
            )
            
            if agent_id:
                print(f"✅ Successfully installed ChainLens agent!")
                print(f"   🤖 Agent ID: {agent_id}")
                print(f"   📦 Account: {account_id}")
            else:
                print(f"❌ Failed to install ChainLens agent for account {account_id}")
        
        except Exception as e:
            print(f"❌ Error: {str(e)}")
            logger.error(f"Failed to install for account {account_id}: {e}", exc_info=True)



async def main():
    parser = argparse.ArgumentParser(
        description="Install ChainLens agent for a user by email or account ID",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    
    parser.add_argument('identifier', help='Email address or account ID (UUID) of the user')
    parser.add_argument('--replace', action='store_true', 
                       help='Replace existing ChainLens agent if present')
    parser.add_argument('--account-id', action='store_true',
                       help='Treat identifier as account ID instead of email')
    
    args = parser.parse_args()
    
    installer = ChainLensUserInstaller()
    
    try:
        await installer.initialize()
        
        if args.account_id:
            await installer.install_for_account_id(args.identifier, args.replace)
        elif '@' in args.identifier:
            await installer.install_for_email(args.identifier, args.replace)
        else:
            await installer.install_for_account_id(args.identifier, args.replace)
            
    except KeyboardInterrupt:
        print("\n⚠️  Operation cancelled by user")
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        logger.error(f"Script error: {str(e)}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main()) 