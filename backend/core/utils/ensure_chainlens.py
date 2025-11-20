import asyncio
from typing import Optional
from core.utils.logger import logger
from core.services.supabase import DBConnection
from core.utils.chainlens_default_agent_service import ChainLensDefaultAgentService
from core.utils.config import get_config

_installation_cache = set()
_installation_in_progress = set()

async def ensure_chainlens_installed(account_id: str, db: Optional[DBConnection] = None) -> None:
    if account_id in _installation_cache:
        return
    
    if account_id in _installation_in_progress:
        return
    
    try:
        _installation_in_progress.add(account_id)
        
        # Use provided db connection or create a new one
        if db is None:
            db = DBConnection()
            await db.initialize()
        
        client = await db.client
        
        # Create a service role client to bypass RLS for agent queries
        # This is needed because RLS may block queries if account doesn't exist or user doesn't have role
        from supabase import create_client, Client
        config = get_config()
        service_client: Optional[Client] = None
        try:
            if config.SUPABASE_SERVICE_ROLE_KEY:
                service_client = create_client(
                    config.SUPABASE_URL,
                    config.SUPABASE_SERVICE_ROLE_KEY
                )
                logger.debug(f"Created service role client for account {account_id}")
        except Exception as service_client_error:
            logger.warning(f"Failed to create service role client: {service_client_error}")
            service_client = None
        
        # First, ensure account exists in basejump.accounts
        # Use service client if available to bypass RLS and foreign key constraints
        account_client = service_client if service_client else client
        try:
            # Check account existence - use sync API for service client, async for regular client
            if service_client:
                account_check_result = account_client.schema('basejump').table('accounts').select('id').eq('id', account_id).limit(1).execute()
                account_check_data = account_check_result.data if hasattr(account_check_result, 'data') else []
            else:
                account_check_result = await account_client.schema('basejump').table('accounts').select('id').eq('id', account_id).limit(1).execute()
                account_check_data = account_check_result.data if account_check_result.data else []
            
            if not account_check_data or len(account_check_data) == 0:
                # Account doesn't exist, try to create it
                logger.info(f"Account {account_id} not found, attempting to create...")
                try:
                    # Try to get user_id from account_id (assuming account_id == user_id for personal accounts)
                    user_id = account_id
                    
                    # Use service client to create account if available (bypasses RLS and foreign key constraints)
                    if service_client:
                        logger.debug(f"Using service role client to create account for user {user_id}")
                        try:
                            # First, try to create user in auth.users if it doesn't exist
                            # This is needed because foreign key constraint requires user to exist
                            try:
                                # Check if user exists
                                user_check = service_client.auth.admin.get_user_by_id(user_id)
                                logger.debug(f"User {user_id} already exists in auth.users")
                            except Exception as user_not_found:
                                # User doesn't exist, create it using Supabase Admin API
                                logger.debug(f"User {user_id} not found, attempting to create...")
                                try:
                                    # Create user with minimal data (email is optional for test users)
                                    service_client.auth.admin.create_user({
                                        "id": user_id,
                                        "email": f"{user_id}@test.local",
                                        "email_confirm": True,
                                        "user_metadata": {"test_user": True}
                                    })
                                    logger.info(f"Created user {user_id} in auth.users")
                                except Exception as create_user_error:
                                    logger.warning(f"Failed to create user {user_id} in auth.users: {create_user_error}. Will try to create account anyway.")
                            
                            # Now create account using service role client
                            account_result = service_client.schema('basejump').table('accounts').insert({
                                'id': account_id,
                                'name': 'Test User',
                                'personal_account': True,
                                'primary_owner_user_id': user_id
                            }).execute()
                            
                            if account_result.data:
                                logger.info(f"Created account {account_id} using service role")
                                # Also create account_user entry
                                try:
                                    service_client.schema('basejump').table('account_user').insert({
                                        'user_id': user_id,
                                        'account_id': account_id,
                                        'account_role': 'owner'
                                    }).execute()
                                    logger.info(f"Created account_user entry for {user_id}")
                                except Exception as user_error:
                                    logger.warning(f"Failed to create account_user entry: {user_error}")
                            else:
                                logger.warning(f"Failed to create account {account_id}")
                        except Exception as create_error:
                            logger.warning(f"Failed to create account {account_id} with service client: {create_error}")
                    else:
                        # Try with regular client (may fail due to foreign key constraint)
                        logger.debug(f"Attempting to create account for user {user_id} with regular client")
                        try:
                            account_result = await account_client.schema('basejump').table('accounts').insert({
                                'id': account_id,
                                'name': 'Test User',
                                'personal_account': True,
                                'primary_owner_user_id': user_id
                            }).execute()
                            
                            if account_result.data:
                                logger.info(f"Created account {account_id}")
                                # Also create account_user entry
                                try:
                                    await account_client.schema('basejump').table('account_user').insert({
                                        'user_id': user_id,
                                        'account_id': account_id,
                                        'account_role': 'owner'
                                    }).execute()
                                except Exception as user_error:
                                    logger.warning(f"Failed to create account_user entry: {user_error}")
                            else:
                                logger.warning(f"Failed to create account {account_id}")
                        except Exception as fk_error:
                            # Foreign key constraint error means user doesn't exist in auth.users
                            # This is expected for test users - skip account creation
                            logger.warning(f"Cannot create account {account_id}: user may not exist in auth.users. Will use user_id as account_id.")
                            # Don't raise - let the system use user_id as account_id (fallback behavior)
                except Exception as create_error:
                    logger.warning(f"Failed to create account {account_id}: {create_error}")
                    # Continue anyway - may already exist or may fail later
        except Exception as account_check_error:
            logger.warning(f"Error checking account existence: {account_check_error}")
        
        # Try to query agents table - if account_id doesn't exist in accounts table, 
        # this will fail, but we can catch and log the error
        # Use service client if available to bypass RLS
        query_client = service_client if service_client else client
        try:
            # For service client, use sync API; for async client, use await
            if service_client:
                existing_result = query_client.table('agents').select('agent_id').eq(
                    'account_id', account_id
                ).eq('metadata->>is_chainlens_default', 'true').limit(1).execute()
                existing_data = existing_result.data if hasattr(existing_result, 'data') else []
            else:
                existing_result = await query_client.table('agents').select('agent_id').eq(
                    'account_id', account_id
                ).eq('metadata->>is_chainlens_default', 'true').limit(1).execute()
                existing_data = existing_result.data if existing_result.data else []
            
            if existing_data:
                _installation_cache.add(account_id)
                logger.debug(f"ChainLens already installed for account {account_id}")
                return
        except Exception as query_error:
            logger.warning(f"Error querying agents table for account {account_id}: {query_error}")
            # Continue to try installation - if account doesn't exist, installation will fail anyway
        
        logger.info(f"Installing ChainLens agent for account {account_id}")
        service = ChainLensDefaultAgentService(db)
        try:
            agent_id = await service.install_chainlens_agent_for_user(account_id, replace_existing=False)
            
            if agent_id:
                _installation_cache.add(account_id)
                logger.info(f"Successfully installed ChainLens agent {agent_id} for account {account_id}")
            else:
                logger.warning(f"Failed to install ChainLens agent for account {account_id} - install_chainlens_agent_for_user returned None")
        except Exception as install_error:
            logger.error(f"Error installing ChainLens agent for account {account_id}: {install_error}", exc_info=True)
            # Don't raise - let the caller handle the missing agent
            
    except Exception as e:
        logger.error(f"Error ensuring ChainLens installation for {account_id}: {e}", exc_info=True)
    finally:
        _installation_in_progress.discard(account_id)


def trigger_chainlens_installation(account_id: str) -> None:
    try:
        asyncio.create_task(ensure_chainlens_installed(account_id))
    except RuntimeError:
        pass

