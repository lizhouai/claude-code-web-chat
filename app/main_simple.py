from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.routers import sessions
import uvicorn
import os
import logging
from dotenv import load_dotenv

# 加载环境变量，优先从 ~/.claudecodechat/.env
import os.path
user_env_path = os.path.expanduser("~/.claudecodechat/.env")
if os.path.exists(user_env_path):
    load_dotenv(user_env_path)
else:
    load_dotenv()  # 回退到当前目录的 .env

app = FastAPI(
    title="Claude Code Web Chat",
    description="An intelligent agent web service based on Claude Code SDK.",
    version="1.2.0"
)

# CORS配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 静态文件服务
if os.path.exists("frontend"):
    app.mount("/static", StaticFiles(directory="frontend/static"), name="static")

# 路由注册
app.include_router(sessions.router, prefix="/api/v1/sessions")

@app.get("/")
async def read_root():
    """主页路由"""
    if os.path.exists("frontend/index.html"):
        return FileResponse("frontend/index.html")
    return {"message": "Claude Code Web Chat is running."}

@app.get("/health")
async def health_check():
    """健康检查端点"""
    return {"status": "healthy", "service": "Claude Code Web Chat"}

if __name__ == "__main__":
    host = os.getenv("API_HOST", "0.0.0.0")
    port = int(os.getenv("API_PORT", "8000"))
    
    uvicorn.run(
        "app.main_simple:app", 
        host=host, 
        port=port, 
        reload=True,
        log_level="info"
    )