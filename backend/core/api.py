from fastapi import APIRouter
from .versioning.api import router as agent_versioning_router
from .core_utils import initialize, cleanup
from .agent_runs import router as agent_runs_router
from .agent_crud import router as agent_crud_router
from .agent_tools import router as agent_tools_router
from .agent_json import router as agent_json_router
from .threads import router as threads_router
from .tools_api import router as tools_api_router
from .vapi_api import router as vapi_router
from .account_deletion import router as account_deletion_router
from .optimizations.quality_api import router as quality_monitoring_router
# Import cache metrics router - check if it exists in api subdirectory
try:
    from .api.cache_metrics_api import router as cache_metrics_router
except ImportError:
    # Fallback: try direct import if cache_metrics_api is in same directory
    try:
        from core.api.cache_metrics_api import router as cache_metrics_router
    except ImportError:
        cache_metrics_router = None

from .api.semantic_cache_api import router as semantic_cache_router

router = APIRouter()

# Include all sub-routers
router.include_router(agent_versioning_router)
router.include_router(agent_runs_router)
router.include_router(agent_crud_router)
router.include_router(agent_tools_router)
router.include_router(agent_json_router)
router.include_router(threads_router)
router.include_router(tools_api_router)
router.include_router(vapi_router)
router.include_router(account_deletion_router)
router.include_router(quality_monitoring_router)  # Story 2.4 - Quality Monitoring
if cache_metrics_router:
    router.include_router(cache_metrics_router)  # Story 1.2 - Cache Metrics (Minor Recommendations)
router.include_router(semantic_cache_router)  # Story 2.1 - Semantic Cache Metrics

# Re-export the initialize and cleanup functions
__all__ = ['router', 'initialize', 'cleanup']