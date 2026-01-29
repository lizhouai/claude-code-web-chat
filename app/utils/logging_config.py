"""
Logging configuration for the Claude Code Web Chat.
"""
import os
import logging
import logging.handlers
from datetime import datetime
from typing import Optional


def setup_logging(
    log_level: str = "INFO",
    log_dir: str = "logs",
    app_name: str = "claude_code_web_chat",
    max_file_size: int = 10 * 1024 * 1024,  # 10MB
    backup_count: int = 5,
    enable_console: bool = True
) -> None:
    """
    Setup logging configuration for the application.
    
    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_dir: Directory to store log files
        app_name: Application name for log file naming
        max_file_size: Maximum size of each log file in bytes
        backup_count: Number of backup log files to keep
        enable_console: Whether to enable console logging
    """
    # Expand ~ in log_dir path if present (safety measure)
    if log_dir.startswith("~"):
        log_dir = os.path.expanduser(log_dir)

    # Create log directory if it doesn't exist
    os.makedirs(log_dir, exist_ok=True)
    
    # Convert log level string to logging level
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)
    
    # Create formatters
    detailed_formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    simple_formatter = logging.Formatter(
        '%(asctime)s - %(levelname)s - %(message)s',
        datefmt='%H:%M:%S'
    )
    
    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(numeric_level)
    
    # Clear existing handlers
    root_logger.handlers.clear()
    
    # File handler for all logs
    all_log_file = os.path.join(log_dir, f"{app_name}.log")
    file_handler = logging.handlers.RotatingFileHandler(
        all_log_file,
        maxBytes=max_file_size,
        backupCount=backup_count,
        encoding='utf-8'
    )
    file_handler.setLevel(numeric_level)
    file_handler.setFormatter(detailed_formatter)
    root_logger.addHandler(file_handler)
    
    # Error log file (WARNING and above)
    error_log_file = os.path.join(log_dir, f"{app_name}_error.log")
    error_handler = logging.handlers.RotatingFileHandler(
        error_log_file,
        maxBytes=max_file_size,
        backupCount=backup_count,
        encoding='utf-8'
    )
    error_handler.setLevel(logging.WARNING)
    error_handler.setFormatter(detailed_formatter)
    root_logger.addHandler(error_handler)
    
    # Console handler (optional)
    if enable_console:
        console_handler = logging.StreamHandler()
        console_handler.setLevel(numeric_level)
        console_handler.setFormatter(simple_formatter)
        root_logger.addHandler(console_handler)
    
    # Set specific logger levels for third-party libraries
    logging.getLogger("uvicorn").setLevel(logging.INFO)
    logging.getLogger("uvicorn.access").setLevel(logging.INFO)
    logging.getLogger("fastapi").setLevel(logging.INFO)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    
    # Log the initial setup message
    logging.info(f"Logging configured - Level: {log_level}, Log dir: {log_dir}")


def get_logger(name: Optional[str] = None) -> logging.Logger:
    """
    Get a logger instance.
    
    Args:
        name: Logger name, defaults to caller's module name
        
    Returns:
        Logger instance
    """
    return logging.getLogger(name)


def log_startup_info():
    """Log application startup information."""
    logger = get_logger(__name__)
    logger.info("=" * 50)
    logger.info("Claude Code Web Chat Starting")
    logger.info(f"Startup time: {datetime.now().isoformat()}")
    logger.info(f"Python version: {os.sys.version}")
    logger.info(f"Working directory: {os.getcwd()}")
    logger.info("=" * 50)


def log_shutdown_info():
    """Log application shutdown information."""
    logger = get_logger(__name__)
    logger.info("=" * 50)
    logger.info("Claude Code Web Chat Shutting Down")
    logger.info(f"Shutdown time: {datetime.now().isoformat()}")
    logger.info("=" * 50)