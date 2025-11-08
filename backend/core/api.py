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
from .api.task_classifier_api import router as task_classifier_router
from .api.model_router_api import router as model_router_router
from .api.multi_model_orchestrator_api import router as workflow_orchestrator_router
# Import optimization dashboard router (Epic 1 + Story 2.4 Integration)
try:
    from .api.optimization_dashboard_api import router as optimization_dashboard_router
except ImportError:
    optimization_dashboard_router = None

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
router.include_router(task_classifier_router)  # Story 3.1 - Task Complexity Classification
router.include_router(model_router_router)  # Story 3.2 - Model Selection Rules
router.include_router(workflow_orchestrator_router)  # Story 3.3 - Sequential Model Execution
if optimization_dashboard_router:
    router.include_router(optimization_dashboard_router)  # Epic 1 + Story 2.4 - Unified Optimization Dashboard

# Re-export the initialize and cleanup functions
__all__ = ['router', 'initialize', 'cleanup']