from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.routers import query, mcp, sessions
from app.services.mcp_manager import mcp_manager
from app.utils.rate_limiter import limiter, rate_limit_exceeded_handler
from app.utils.config import local_config
from slowapi.errors import RateLimitExceeded
import uvicorn
import os
import logging
from app.utils.logging_config import setup_logging, log_startup_info, log_shutdown_info

# Use local config manager (automatically loads .env)

app = FastAPI(
    title="Claude Code Web Chat",
    description="An intelligent agent web service based on Claude Code SDK.",
    version="1.2.0"
)

# Add rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static file service
if os.path.exists("frontend"):
    app.mount("/static", StaticFiles(directory="frontend/static"), name="static")

# Test files service
if os.path.exists("tests"):
    app.mount("/tests", StaticFiles(directory="tests"), name="tests")

# Router registration
app.include_router(query.router, prefix="/api/v1")
app.include_router(mcp.router, prefix="/api/v1/mcp")
app.include_router(sessions.router, prefix="/api/v1/sessions")

@app.on_event("startup")
async def startup_event():
    """Application startup event"""
    # Configure logging
    log_config = local_config.get_logging_config()
    
    setup_logging(
        log_level=log_config["log_level"],
        log_dir=log_config["log_dir"],
        enable_console=log_config["log_console"],
        max_file_size=log_config["log_file_size"],
        backup_count=log_config["log_backup_count"]
    )
    
    log_startup_info()
    
    try:
        await mcp_manager.initialize()
        logging.info("MCP Manager initialized successfully")
    except Exception as e:
        logging.error(f"Failed to initialize MCP Manager: {e}")

@app.on_event("shutdown") 
async def shutdown_event():
    """Application shutdown event"""
    try:
        await mcp_manager.shutdown()
        logging.info("MCP Manager shutdown completed")
        log_shutdown_info()
    except Exception as e:
        logging.error(f"Error during MCP Manager shutdown: {e}")
        log_shutdown_info()

@app.get("/")
async def read_root():
    """Home page route"""
    if os.path.exists("frontend/index.html"):
        return FileResponse("frontend/index.html")
    return {"message": "Claude Code Web Chat is running."}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "Claude Code Web Chat"}

if __name__ == "__main__":
    # Get configuration using local config manager
    api_config = local_config.get_api_config()
    
    uvicorn.run(
        "app.main:app", 
        host=api_config["host"], 
        port=api_config["port"], 
        reload=True,
        log_level="info"
    )