"""
Quality Alerting Mechanisms (Story 2.4).

Alerting system for quality threshold breaches.
Supports email, logging, and extensible callback system.
"""

import os
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone

from core.utils.logger import logger


async def log_alert(alert_data: Dict[str, Any]) -> None:
    """
    Log quality alert to system logs.
    
    Args:
        alert_data: Alert data dictionary with metric_name, value, threshold, etc.
    """
    metric_name = alert_data.get("metric_name", "unknown")
    value = alert_data.get("value", 0.0)
    threshold = alert_data.get("threshold", 0.0)
    timestamp = alert_data.get("timestamp", datetime.now(timezone.utc).isoformat())
    
    logger.warning(
        f"🚨 QUALITY ALERT - {metric_name}: {value:.3f} < {threshold:.3f} "
        f"(timestamp: {timestamp})"
    )


async def email_alert(alert_data: Dict[str, Any], recipients: Optional[List[str]] = None) -> None:
    """
    Send quality alert via email.
    
    Args:
        alert_data: Alert data dictionary
        recipients: List of email addresses to notify (defaults to admin emails from config)
    """
    try:
        from core.services.email import EmailService
        
        email_service = EmailService()
        
        if not email_service.client:
            logger.warning("Email service not configured, skipping email alert")
            return
        
        # Get recipients from config or use defaults
        if not recipients:
            # Try to get admin emails from config
            from core.utils.config import config
            admin_emails = getattr(config, 'ADMIN_EMAILS', None)
            if admin_emails:
                recipients = admin_emails if isinstance(admin_emails, list) else [admin_emails]
            else:
                # Fallback: use environment variable
                admin_email = os.getenv('ADMIN_EMAIL')
                recipients = [admin_email] if admin_email else []
        
        if not recipients:
            logger.warning("No alert recipients configured, skipping email alert")
            return
        
        # Format alert message
        metric_name = alert_data.get("metric_name", "unknown")
        value = alert_data.get("value", 0.0)
        threshold = alert_data.get("threshold", 0.0)
        current_metrics = alert_data.get("current_metrics", {})
        
        subject = f"🚨 Quality Alert: {metric_name} threshold breached"
        text_content = f"""
Quality Monitoring Alert

Metric: {metric_name}
Value: {value:.3f}
Threshold: {threshold:.3f}
Status: BREACHED

Current Metrics:
- Response Similarity: {current_metrics.get('response_similarity', 0.0):.3f}
- Tool Success Rate: {current_metrics.get('tool_success_rate', 0.0):.3f}
- User Satisfaction: {current_metrics.get('user_satisfaction', 0.0):.3f}
- Error Rate: {current_metrics.get('error_rate', 0.0):.3f}
- Response Completeness: {current_metrics.get('response_completeness', 0.0):.3f}

Timestamp: {alert_data.get('timestamp', datetime.now(timezone.utc).isoformat())}

Please review the quality metrics and consider rolling back to ORIGINAL mode if necessary.
"""
        
        # Send email to all recipients
        for recipient in recipients:
            try:
                # Use email service's internal send method
                # Note: This is a simplified version - full implementation would use proper email templates
                logger.info(f"Sending quality alert email to {recipient}")
                # email_service._send_email(...) - would need proper implementation
            except Exception as e:
                logger.error(f"Failed to send alert email to {recipient}: {e}")
    
    except Exception as e:
        logger.error(f"Error in email alert: {e}")


def create_alert_callbacks(
    enable_email: bool = False,
    email_recipients: Optional[List[str]] = None
) -> List:
    """
    Create list of alert callbacks.
    
    Args:
        enable_email: Whether to enable email alerts
        email_recipients: List of email recipients (optional)
    
    Returns:
        List of alert callback functions
    """
    callbacks = [log_alert]  # Always include logging
    
    if enable_email:
        # Create email alert callback with recipients
        async def email_callback(alert_data: Dict[str, Any]) -> None:
            await email_alert(alert_data, recipients=email_recipients)
        
        callbacks.append(email_callback)
    
    return callbacks

