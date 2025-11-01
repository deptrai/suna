import asyncio
from typing import Optional
from core.utils.logger import logger
from core.services.supabase import DBConnection
from core.utils.chainlens_default_agent_service import ChainLensDefaultAgentService

_installation_cache = set()
_installation_in_progress = set()

async def ensure_chainlens_installed(account_id: str) -> None:
    if account_id in _installation_cache:
        return
    
    if account_id in _installation_in_progress:
        return
    
    try:
        _installation_in_progress.add(account_id)
        
        db = DBConnection()
        await db.initialize()
        client = await db.client
        
        existing = await client.from_('agents').select('agent_id').eq(
            'account_id', account_id
        ).eq('metadata->>is_chainlens_default', 'true').limit(1).execute()
        
        if existing.data:
            _installation_cache.add(account_id)
            logger.debug(f"ChainLens already installed for account {account_id}")
            return
        
        logger.info(f"Installing ChainLens agent for account {account_id}")
        service = ChainLensDefaultAgentService(db)
        agent_id = await service.install_chainlens_agent_for_user(account_id, replace_existing=False)
        
        if agent_id:
            _installation_cache.add(account_id)
            logger.info(f"Successfully installed ChainLens agent {agent_id} for account {account_id}")
        else:
            logger.warning(f"Failed to install ChainLens agent for account {account_id}")
            
    except Exception as e:
        logger.error(f"Error ensuring ChainLens installation for {account_id}: {e}")
    finally:
        _installation_in_progress.discard(account_id)


def trigger_chainlens_installation(account_id: str) -> None:
    try:
        asyncio.create_task(ensure_chainlens_installed(account_id))
    except RuntimeError:
        pass

