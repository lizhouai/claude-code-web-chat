"""
Rate limiting utilities for the FastAPI application.
"""
import os
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.requests import Request
from fastapi.responses import JSONResponse


def get_rate_limit() -> str:
    """Get rate limit from environment variable."""
    rate_per_minute = int(os.getenv("RATE_LIMIT_PER_MINUTE", "60"))
    return f"{rate_per_minute}/minute"


def get_client_ip(request: Request) -> str:
    """
    Get client IP address from request.
    Handles both direct connections and proxy forwarded headers.
    """
    # Check for forwarded headers first (for reverse proxy setups)
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    
    # Check for real IP header
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip
    
    # Fall back to remote address
    return get_remote_address(request)


# Create limiter instance
limiter = Limiter(
    key_func=get_client_ip,
    default_limits=[get_rate_limit()]
)


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    """
    Custom rate limit exceeded handler.
    Returns a JSON response with rate limit information.
    """
    response = JSONResponse(
        status_code=429,
        content={
            "error": "Rate limit exceeded",
            "message": f"Too many requests. Limit: {exc.detail}",
            "retry_after": getattr(exc, "retry_after", None)
        }
    )
    
    # Add rate limit headers
    if hasattr(exc, "retry_after"):
        response.headers["Retry-After"] = str(exc.retry_after)
    
    return response