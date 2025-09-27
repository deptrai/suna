"""
API endpoints for LLM metrics and monitoring.

This module provides REST endpoints for accessing LLM performance metrics,
health status, and usage statistics.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from core.ai_models.llm_metrics import metrics_collector, get_llm_health
import structlog

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/llm", tags=["LLM Metrics"])


@router.get("/health")
async def get_llm_health_status() -> Dict[str, Any]:
    """Get overall LLM health status and summary metrics."""
    try:
        health_summary = get_llm_health()
        logger.info("LLM health status requested", status=health_summary.get("status"))
        return {
            "success": True,
            "data": health_summary,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error("Failed to get LLM health status", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to retrieve health status")


@router.get("/metrics/providers")
async def get_provider_metrics(provider: Optional[str] = Query(None)) -> Dict[str, Any]:
    """Get metrics for all providers or a specific provider."""
    try:
        provider_stats = metrics_collector.get_provider_stats(provider)
        logger.info("Provider metrics requested", provider=provider, stats_count=len(provider_stats) if isinstance(provider_stats, dict) else 1)
        
        return {
            "success": True,
            "data": provider_stats,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error("Failed to get provider metrics", provider=provider, error=str(e))
        raise HTTPException(status_code=500, detail="Failed to retrieve provider metrics")


@router.get("/metrics/models")
async def get_model_metrics(model: Optional[str] = Query(None)) -> Dict[str, Any]:
    """Get metrics for all models or a specific model."""
    try:
        model_stats = metrics_collector.get_model_stats(model)
        logger.info("Model metrics requested", model=model, stats_count=len(model_stats) if isinstance(model_stats, dict) else 1)
        
        return {
            "success": True,
            "data": model_stats,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error("Failed to get model metrics", model=model, error=str(e))
        raise HTTPException(status_code=500, detail="Failed to retrieve model metrics")


@router.get("/metrics/failures")
async def get_recent_failures(hours: int = Query(24, ge=1, le=168)) -> Dict[str, Any]:
    """Get recent failures within the specified time window (1-168 hours)."""
    try:
        recent_failures = metrics_collector.get_recent_failures(hours)
        
        # Convert metrics objects to serializable format
        failure_data = []
        for failure in recent_failures:
            failure_data.append({
                "model_name": failure.model_name,
                "provider": failure.provider,
                "strategy": failure.strategy,
                "error_type": failure.error_type,
                "error_message": failure.error_message,
                "timestamp": datetime.fromtimestamp(failure.start_time).isoformat(),
                "response_time_ms": failure.response_time_ms,
                "stream": failure.stream
            })
        
        logger.info("Recent failures requested", hours=hours, failure_count=len(failure_data))
        
        return {
            "success": True,
            "data": {
                "failures": failure_data,
                "count": len(failure_data),
                "time_window_hours": hours
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error("Failed to get recent failures", hours=hours, error=str(e))
        raise HTTPException(status_code=500, detail="Failed to retrieve failure data")


@router.get("/metrics/summary")
async def get_metrics_summary() -> Dict[str, Any]:
    """Get comprehensive metrics summary including health, providers, and models."""
    try:
        health_summary = get_llm_health()
        provider_stats = metrics_collector.get_provider_stats()
        model_stats = metrics_collector.get_model_stats()
        recent_failures = metrics_collector.get_recent_failures(1)  # Last hour
        
        # Calculate top performing models and providers
        top_models = []
        for model_name, stats in model_stats.items():
            if stats.get('total_calls', 0) > 0:
                top_models.append({
                    "model": model_name,
                    "total_calls": stats['total_calls'],
                    "success_rate": stats.get('success_rate', 0),
                    "avg_response_time": stats.get('avg_response_time', 0)
                })
        
        top_models.sort(key=lambda x: x['total_calls'], reverse=True)
        top_models = top_models[:5]  # Top 5
        
        top_providers = []
        for provider_name, stats in provider_stats.items():
            if stats.get('total_calls', 0) > 0:
                top_providers.append({
                    "provider": provider_name,
                    "total_calls": stats['total_calls'],
                    "success_rate": stats.get('success_rate', 0),
                    "avg_response_time": stats.get('avg_response_time', 0)
                })
        
        top_providers.sort(key=lambda x: x['total_calls'], reverse=True)
        
        summary = {
            "health": health_summary,
            "overview": {
                "total_providers": len(provider_stats),
                "total_models": len(model_stats),
                "recent_failures_1h": len(recent_failures)
            },
            "top_models": top_models,
            "top_providers": top_providers
        }
        
        logger.info("Metrics summary requested", 
                   total_providers=len(provider_stats),
                   total_models=len(model_stats),
                   health_status=health_summary.get("status"))
        
        return {
            "success": True,
            "data": summary,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error("Failed to get metrics summary", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to retrieve metrics summary")


@router.post("/metrics/reset")
async def reset_metrics() -> Dict[str, Any]:
    """Reset all metrics (use with caution)."""
    try:
        # Clear metrics collector
        metrics_collector.call_history.clear()
        metrics_collector.provider_stats.clear()
        metrics_collector.model_stats.clear()
        
        logger.warning("LLM metrics reset requested and executed")
        
        return {
            "success": True,
            "message": "All LLM metrics have been reset",
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error("Failed to reset metrics", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to reset metrics")
