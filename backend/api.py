from dotenv import load_dotenv
load_dotenv()

# CRITICAL: Import and configure Dramatiq broker BEFORE importing any actors
# This ensures the backend API uses the same broker instance as the worker
import dramatiq
from dramatiq.brokers.redis import RedisBroker
import os as _os
_redis_host = _os.getenv('REDIS_HOST', 'localhost')
_redis_port = int(_os.getenv('REDIS_PORT', 6379))
_redis_broker = RedisBroker(host=_redis_host, port=_redis_port, middleware=[dramatiq.middleware.AsyncIO()])
dramatiq.set_broker(_redis_broker)
print(f"🔧 [API] Dramatiq broker configured: {_redis_host}:{_redis_port}")

from fastapi import FastAPI, Request, HTTPException, Response, Depends, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from core.services import redis
import sentry
from contextlib import asynccontextmanager
from core.agentpress.thread_manager import ThreadManager
from core.services.supabase import DBConnection
from datetime import datetime, timezone
from core.utils.config import config, EnvMode
import asyncio
from core.utils.logger import logger, structlog
import time
from collections import OrderedDict
import os

from pydantic import BaseModel
import uuid

# Import routers directly instead of importing from core.api
# There's a conflict: core/api.py (file) vs core/api/ (package)
# Solution: Import all routers directly and combine them
from fastapi import APIRouter
from core.versioning.api import router as agent_versioning_router
from core.agent_runs import router as agent_runs_router
from core.agent_crud import router as agent_crud_router
from core.agent_tools import router as agent_tools_router
from core.agent_json import router as agent_json_router
from core.threads import router as threads_router
from core.tools_api import router as tools_api_router
from core.vapi_api import router as vapi_router
from core.account_deletion import router as account_deletion_router
from core.optimizations.quality_api import router as quality_monitoring_router
from core.core_utils import initialize, cleanup

# Import from core.api package (not the file)
try:
    from core.api.cache_metrics_api import router as cache_metrics_router
except ImportError:
    cache_metrics_router = None

from core.api.semantic_cache_api import router as semantic_cache_router
from core.api.task_classifier_api import router as task_classifier_router
from core.api.model_router_api import router as model_router_router
from core.api.multi_model_orchestrator_api import router as workflow_orchestrator_router

try:
    from core.api.optimization_dashboard_api import router as optimization_dashboard_router
except ImportError:
    optimization_dashboard_router = None

# Create the combined router (same as core/api.py does)
core_api_router = APIRouter()
core_api_router.include_router(agent_versioning_router)
core_api_router.include_router(agent_runs_router)
core_api_router.include_router(agent_crud_router)
core_api_router.include_router(agent_tools_router)
core_api_router.include_router(agent_json_router)
core_api_router.include_router(threads_router)
core_api_router.include_router(tools_api_router)
core_api_router.include_router(vapi_router)
core_api_router.include_router(account_deletion_router)
core_api_router.include_router(quality_monitoring_router)
if cache_metrics_router:
    core_api_router.include_router(cache_metrics_router)
core_api_router.include_router(semantic_cache_router)
core_api_router.include_router(task_classifier_router)
core_api_router.include_router(model_router_router)
core_api_router.include_router(workflow_orchestrator_router)
if optimization_dashboard_router:
    core_api_router.include_router(optimization_dashboard_router)

# Create a mock core_api object with router and initialize/cleanup attributes
# Wrap initialize to match expected signature
def initialize_wrapper(db, instance_id):
    return initialize(db, instance_id)

class CoreApiModule:
    router = core_api_router
    initialize = initialize_wrapper
    cleanup = cleanup

core_api = CoreApiModule()

from core.sandbox import api as sandbox_api
from core.billing.api import router as billing_router
from core.billing.setup_api import router as setup_router
from core.admin.admin_api import router as admin_router
from core.admin.billing_admin_api import router as billing_admin_router
from core.admin.master_password_api import router as master_password_router
from core.services import transcription as transcription_api
import sys
from core.services import email_api
from core.triggers import api as triggers_api
from core.services import api_keys_api


if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

db = DBConnection()
instance_id = "single"

# Rate limiter state
ip_tracker = OrderedDict()
MAX_CONCURRENT_IPS = 25

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.debug(f"Starting up FastAPI application with instance ID: {instance_id} in {config.ENV_MODE.value} mode")
    try:
        await db.initialize()
        
        initialize(
            db,
            instance_id
        )
        
        
        sandbox_api.initialize(db)
        
        # Initialize Redis connection
        from core.services import redis
        try:
            await redis.initialize_async()
            logger.debug("Redis connection initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize Redis connection: {e}")
            # Continue without Redis - the application will handle Redis failures gracefully
        
        # Start background tasks
        # asyncio.create_task(core_api.restore_running_agent_runs())
        
        triggers_api.initialize(db)
        credentials_api.initialize(db)
        template_api.initialize(db)
        composio_api.initialize(db)
        
        from core import limits_api
        limits_api.initialize(db)
        
        yield
        
        logger.debug("Cleaning up agent resources")
        await cleanup()
        
        try:
            logger.debug("Closing Redis connection")
            await redis.close()
            logger.debug("Redis connection closed successfully")
        except Exception as e:
            logger.error(f"Error closing Redis connection: {e}")

        logger.debug("Disconnecting from database")
        await db.disconnect()
    except Exception as e:
        logger.error(f"Error during application startup: {e}")
        raise

app = FastAPI(lifespan=lifespan)

# Define allowed origins based on environment
allowed_origins = ["https://www.epsilon.com", "https://epsilon.com", "https://www.chainlens.net", "https://chainlens.net"]
allow_origin_regex = None

# Add staging-specific origins
if config.ENV_MODE == EnvMode.LOCAL:
    allowed_origins.append("http://localhost:3000")
    allowed_origins.append("http://127.0.0.1:3000")
    allowed_origins.append("http://localhost:3001")
    allowed_origins.append("http://127.0.0.1:3001")

# Add staging-specific origins
if config.ENV_MODE == EnvMode.STAGING:
    allowed_origins.append("https://staging.chainlens.net")
    allowed_origins.append("http://localhost:3000")
    allowed_origins.append("http://localhost:3001")
    # Allow Vercel preview deployments for both legacy and new project names
    allow_origin_regex = r"https://(chainlens|epsiloncom)-.*-prjcts\.vercel\.app"

# Add localhost for production mode local testing (for master password login)
if config.ENV_MODE == EnvMode.PRODUCTION:
    allowed_origins.append("http://localhost:3000")
    allowed_origins.append("http://127.0.0.1:3000")
    allowed_origins.append("http://localhost:3001")
    allowed_origins.append("http://127.0.0.1:3001")

# Handle OPTIONS requests FIRST (add this middleware LAST so it runs FIRST in reverse order)
@app.middleware("http")
async def options_cors_middleware(request: Request, call_next):
    """Handle OPTIONS requests before routing to avoid 405 errors"""
    if request.method == "OPTIONS":
        logger.debug(f"[OPTIONS] Intercepted OPTIONS request: {request.url.path}")
        from fastapi.responses import Response
        import re
        origin = request.headers.get("origin")
        if origin:
            origin_allowed = origin in allowed_origins
            if not origin_allowed and allow_origin_regex:
                pattern = re.compile(allow_origin_regex)
                origin_allowed = bool(pattern.match(origin))
            
            if origin_allowed:
                logger.debug(f"[OPTIONS] Returning 200 OK with CORS headers for origin: {origin}")
                return Response(
                    status_code=200,
                    headers={
                        "Access-Control-Allow-Origin": origin,
                        "Access-Control-Allow-Credentials": "true",
                        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
                        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Project-Id, X-MCP-URL, X-MCP-Type, X-MCP-Headers, X-Refresh-Token, X-API-Key",
                        "Access-Control-Max-Age": "600",
                    }
                )
        # Return 200 even if origin not allowed (let CORSMiddleware handle validation)
        logger.debug(f"[OPTIONS] Returning 200 OK (origin not allowed or no origin)")
        return Response(status_code=200, headers={"Access-Control-Max-Age": "600"})
    
    return await call_next(request)

# Add CORS middleware AFTER options handler (runs BEFORE in reverse order)
# CORSMiddleware adds CORS headers to all responses (including errors)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Project-Id", "X-MCP-URL", "X-MCP-Type", "X-MCP-Headers", "X-Refresh-Token", "X-API-Key"],
    expose_headers=["*"],  # Expose all headers
    max_age=600,  # Cache preflight for 10 minutes
)

@app.middleware("http")
async def log_requests_middleware(request: Request, call_next):
    structlog.contextvars.clear_contextvars()

    request_id = str(uuid.uuid4())
    start_time = time.time()
    client_ip = request.client.host if request.client else "unknown"
    method = request.method
    path = request.url.path
    query_params = str(request.query_params)

    structlog.contextvars.bind_contextvars(
        request_id=request_id,
        client_ip=client_ip,
        method=method,
        path=path,
        query_params=query_params
    )

    # Log the incoming request
    logger.debug(f"Request started: {method} {path} from {client_ip} | Query: {query_params}")
    
    try:
        response = await call_next(request)
        process_time = time.time() - start_time
        logger.debug(f"Request completed: {method} {path} | Status: {response.status_code} | Time: {process_time:.2f}s")
        return response
    except Exception as e:
        process_time = time.time() - start_time
        try:
            error_str = str(e)
        except Exception:
            error_str = f"Error of type {type(e).__name__}"
        logger.error(f"Request failed: {method} {path} | Error: {error_str} | Time: {process_time:.2f}s")
        raise

# Create a main API router
api_router = APIRouter()

# Include all API routers without individual prefixes
api_router.include_router(core_api_router)
api_router.include_router(sandbox_api.router)
api_router.include_router(billing_router)
api_router.include_router(setup_router)
api_router.include_router(api_keys_api.router)
api_router.include_router(billing_admin_router)
api_router.include_router(admin_router)
api_router.include_router(master_password_router)

from core.mcp_module import api as mcp_api
from core.credentials import api as credentials_api
from core.templates import api as template_api

api_router.include_router(mcp_api.router)
api_router.include_router(credentials_api.router, prefix="/secure-mcp")
api_router.include_router(template_api.router, prefix="/templates")

api_router.include_router(transcription_api.router)
api_router.include_router(email_api.router)

from core.knowledge_base import api as knowledge_base_api
api_router.include_router(knowledge_base_api.router)

api_router.include_router(triggers_api.router)

from core.composio_integration import api as composio_api
api_router.include_router(composio_api.router)

from core.google.google_slides_api import router as google_slides_router
api_router.include_router(google_slides_router)

from core.google.google_docs_api import router as google_docs_router
api_router.include_router(google_docs_router)

@api_router.get("/presentation-templates/{template_name}/image.png", summary="Get Presentation Template Image", tags=["presentations"])
async def get_presentation_template_image(template_name: str):
    """Serve presentation template preview images"""
    try:
        # Construct path to template image
        image_path = os.path.join(
            os.path.dirname(__file__),
            "core",
            "templates",
            "presentations",
            template_name,
            "image.png"
        )
        
        # Verify file exists and is within templates directory (security check)
        image_path = os.path.abspath(image_path)
        templates_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "core", "templates", "presentations"))
        
        if not image_path.startswith(templates_dir):
            raise HTTPException(status_code=403, detail="Access denied")
        
        if not os.path.exists(image_path):
            raise HTTPException(status_code=404, detail="Template image not found")
        
        return FileResponse(image_path, media_type="image/png")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving template image: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@api_router.get("/presentation-templates/{template_name}/pdf", summary="Get Presentation Template PDF", tags=["presentations"])
async def get_presentation_template_pdf(template_name: str):
    """Serve presentation template PDF files"""
    try:
        # Construct path to template pdf folder
        pdf_folder = os.path.join(
            os.path.dirname(__file__),
            "core",
            "templates",
            "presentations",
            template_name,
            "pdf"
        )
        
        # Verify folder exists and is within templates directory (security check)
        pdf_folder = os.path.abspath(pdf_folder)
        templates_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "core", "templates", "presentations"))
        
        if not pdf_folder.startswith(templates_dir):
            raise HTTPException(status_code=403, detail="Access denied")
        
        if not os.path.exists(pdf_folder):
            raise HTTPException(status_code=404, detail="Template PDF folder not found")
        
        # Find the first PDF file in the folder
        pdf_files = [f for f in os.listdir(pdf_folder) if f.lower().endswith('.pdf')]
        
        if not pdf_files:
            raise HTTPException(status_code=404, detail="No PDF file found in template")
        
        # Use the first PDF file found
        pdf_path = os.path.join(pdf_folder, pdf_files[0])
        
        return FileResponse(
            pdf_path, 
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"inline; filename={template_name}.pdf"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving template PDF: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@api_router.get("/health", summary="Health Check", operation_id="health_check", tags=["system"])
async def health_check():
    logger.debug("Health check endpoint called")
    return {
        "status": "ok", 
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "instance_id": instance_id
    }

@api_router.get("/health-docker", summary="Docker Health Check", operation_id="health_check_docker", tags=["system"])
async def health_check_docker():
    logger.debug("Health docker check endpoint called")
    try:
        client = await redis.get_client()
        await client.ping()
        db = DBConnection()
        await db.initialize()
        db_client = await db.client
        await db_client.table("threads").select("thread_id").limit(1).execute()
        logger.debug("Health docker check complete")
        return {
            "status": "ok", 
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "instance_id": instance_id
        }
    except Exception as e:
        logger.error(f"Failed health docker check: {e}")
        raise HTTPException(status_code=500, detail="Health check failed")


app.include_router(api_router, prefix="/api")


if __name__ == "__main__":
    import uvicorn
    
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    
    # Enable reload mode for local and staging environments
    is_dev_env = config.ENV_MODE in [EnvMode.LOCAL, EnvMode.STAGING]
    workers = 1 if is_dev_env else 4
    reload = is_dev_env
    
    logger.debug(f"Starting server on 0.0.0.0:8000 with {workers} workers (reload={reload})")
    uvicorn.run(
        "api:app", 
        host="0.0.0.0", 
        port=8000,
        workers=workers,
        loop="asyncio"
    )