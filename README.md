# Claude Code Web Chat

A comprehensive web service built with FastAPI that provides Claude Code capabilities through a user-friendly web interface with MCP (Model Context Protocol) server integration.

## Features

### 🤖 General Query Interface
- Interactive web interface for Claude Code queries
- Support for streaming responses
- Real-time response rendering
- MCP tool integration

### 🔌 MCP Server Integration
- Automatic MCP server discovery and management
- Health monitoring and auto-restart
- Support for Atlassian tools (Jira and Confluence integration)
- Real-time tool availability tracking

### 🛡️ Security & Performance
- Built-in API rate limiting (configurable via environment variables)

## Project Structure

```
claude-code-web-chat/
├── app/                        # Main application package
│   ├── __init__.py
│   ├── main.py                 # FastAPI application entry point (full version)
│   ├── main_simple.py          # Simplified FastAPI application
│   ├── models.py               # Pydantic model definitions
│   ├── middleware/             # Custom middleware components
│   ├── services/               # Business logic services
│   │   ├── __init__.py
│   │   ├── claude_service.py   # Core Claude Code integration
│   │   ├── mcp_manager.py      # MCP server management
│   │   └── session_manager.py  # Session management service
│   ├── routers/                # API route definitions
│   │   ├── __init__.py
│   │   ├── query.py            # General query endpoints
│   │   ├── mcp.py              # MCP management endpoints
│   │   └── sessions.py         # Session management endpoints
│   └── utils/                  # Utility functions
│       ├── __init__.py
│       ├── streaming.py        # Streaming response utilities
│       ├── rate_limiter.py     # Rate limiting utilities
│       ├── logging_config.py   # Logging configuration
│       └── config.py           # Application configuration
├── frontend/                   # Web interface
│   ├── index.html              # Main application page
│   └── static/                 # Static web assets
│       ├── css/
│       │   └── chat.css        # Chat interface styling
│       ├── images/
│       │   └── logo.png  # Application logo
│       ├── js/
│       │   ├── chat.js         # Chat interface functionality
│       │   ├── sessionManager.js    # Session management UI
│       │   ├── markdown-formatter.js   # Markdown rendering utilities
│       │   ├── confirmDialog.js      # Dialog confirmation component
│       │   └── prompts/              # Prompt templates
│       │       └── pct_analysis_v2.txt  # PCT analysis prompt template
│       └── libs/               # Third-party JavaScript libraries
│           ├── marked.min.js   # Markdown parser
│           ├── prism-core.min.js     # Syntax highlighting core
│           ├── prism-autoloader.min.js   # Dynamic language loading
│           └── prism.css       # Syntax highlighting styles
├── tests/                      # Comprehensive test suite
│   ├── __init__.py
│   ├── test_mcp_api.py         # MCP API integration tests
│   ├── test_rate_limit.py      # Rate limiting functionality tests
│   ├── test_rate_limit_simple.py   # Simplified rate limit tests
│   ├── test_api_fix.py         # API bug fix tests
│   ├── test_fix_simple.py      # Simple functionality tests
│   ├── test_config_isolation.py    # Configuration isolation tests
│   ├── test_session_ui.html    # Session UI testing interface
│   ├── test_session_performance.html  # Performance testing UI
│   ├── test_sync_system.html   # Synchronization system tests
│   ├── test-session-refresh-fix.html   # Session refresh bug tests
│   ├── test-markdown.html      # Markdown rendering tests
│   ├── test-mode-fix.js        # Mode switching bug fixes
│   ├── test-server-mode-fix.html   # Server mode testing
│   ├── test-mode-sync-fix.html     # Mode synchronization tests
│   ├── test-mode-persistence.html  # Mode persistence tests
│   ├── test-session-compatibility.html # Session compatibility tests
│   ├── debug-localstorage.html # Local storage debugging
│   └── README.md               # Comprehensive test documentation
├── docs/                       # Project documentation
│   ├── README.md               # Documentation index and overview
│   ├── RATE_LIMITING_IMPLEMENTATION.md  # Rate limiting technical guide
│   └── CONFIGURATION_ISOLATION.md      # Configuration isolation guide
├── scripts/                    # Utility scripts
│   └── generate_claude_settings.py     # Claude configuration generator
├── .claude/                    # Claude Code configuration
│   ├── settings.local.json.example     # Configuration template
│   └── settings.local.json     # Local Claude settings
├── mcp_servers.json            # MCP server configuration
├── requirements.txt            # Python dependencies (full)
├── requirements_minimal.txt    # Minimal dependencies
├── .env.example                # Environment configuration template
├── .gitignore                  # Git ignore patterns
├── docker-compose.yml          # Docker orchestration
├── Dockerfile                  # Container configuration
├── Makefile                    # Build and development commands
├── CHANGELOG.md                # Version history and release notes
└── README.md                   # Project documentation (this file)
```

## Quick Start

### 🚀 One-Click Setup with uvx (Recommended)

The easiest way to get started! Just create a configuration file and run with uvx.

#### Prerequisites
- Python 3.11
- Node.js 24.4.1+
- [uvx](https://docs.astral.sh/uv/getting-started/installation/)

#### Installation & Setup

1. **Create configuration directory**
   ```bash
   mkdir -p ~/.claudecodechat
   ```

2. **Create configuration file**
   ```bash
   cat > ~/.claudecodechat/env.conf << 'EOF'
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   ANTHROPIC_MODEL=claude-4.5-sonnet
   ANTHROPIC_DEFAULT_OPUS_MODEL=claude-4.1-opus
   ANTHROPIC_DEFAULT_SONNET_MODEL=claude-4.5-sonnet
   ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-3.5-haiku
   CLAUDE_CODE_SUBAGENT_MODEL=claude-4.5-sonnet
   DISABLE_NON_ESSENTIAL_MODEL_CALLS=1
   MCP_JIRA_SERVER_URL=https://your-company.atlassian.net
   MCP_JIRA_USERNAME=your_jira_username@example.com
   MCP_JIRA_API_TOKEN=your_jira_api_token_here
   MCP_CONFLUENCE_SERVER_URL=https://your-company.atlassian.net/wiki
   MCP_CONFLUENCE_USERNAME=your_confluence_username@example.com
   MCP_CONFLUENCE_API_TOKEN=your_confluence_api_token_here
   EOF
   ```

3. **Edit the configuration file and update with your actual credentials**
   ```bash
   # Edit ~/.claudecodechat/env.conf and replace the placeholder values:
   # - your_anthropic_api_key_here: Your actual Anthropic API key
   # - your_jira_username@example.com: Your Jira username/email
   # - your_jira_api_token_here: Your Jira API token
   # - your_confluence_username@example.com: Your Confluence username/email
   # - your_confluence_api_token_here: Your Confluence API token
   ```

4. **Run with uvx**
   ```bash
   uvx --python 3.11 --from git+ssh://github.com/lizhouai/claude-code-web-chat.git claude-code-web-chat
   ```

That's it! The application will:
- ✅ Automatically read your configuration from `~/.claudecodechat/env.conf`
- ✅ Generate the necessary `.env` file from your configuration
- ✅ Generate Claude settings automatically
- ✅ Start the web service on http://127.0.0.1:8000
- ✅ Open your browser automatically

### Manual Development Setup

#### Prerequisites
- Python 3.11
- Node.js 24.4.1+
- Claude Code (npm install -g @anthropic-ai/claude-code)
- uvx (https://docs.astral.sh/uv/getting-started/installation/)
- Docker and Docker Compose (optional)

### Local Development

1. **Clone and setup**
   ```bash
   git clone https://github.com/lizhouai/claude-code-web-chat.git
   cd claude-code-web-chat
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. **Configure environment**
   ```bash
   cp conf/.env.example .env
   # Edit .env with your configuration

   python scripts/generate_claude_settings.py
   ```

3. **Run the application**
   ```bash
   python -m uvicorn app.main:app
   ```

4. **Access the interface**
   - Web UI: http://localhost:8000
   - API Documentation: http://localhost:8000/docs
   - Health Check: http://localhost:8000/health

### Docker Deployment (Not currently available)

1. **Build and run with Docker Compose**
   ```bash
   docker-compose up -d
   ```

2. **Check service health**
   ```bash
   docker-compose ps
   curl http://localhost:8000/health
   ```

## API Endpoints

### General Query API
- `POST /api/v1/query` - Submit a query for processing
- `POST /api/v1/query/stream` - Stream query responses
- `GET /api/v1/sessions/{session_id}` - Get session information

### MCP Management API
- `GET /api/v1/mcp/health` - Get MCP servers health status
- `GET /api/v1/mcp/servers` - List all configured MCP servers
- `GET /api/v1/mcp/servers/{name}/health` - Get specific server health
- `POST /api/v1/mcp/servers/{name}/start` - Start MCP server
- `POST /api/v1/mcp/servers/{name}/stop` - Stop MCP server
- `POST /api/v1/mcp/servers/{name}/restart` - Restart MCP server
- `GET /api/v1/mcp/tools` - Get available MCP tools
- `POST /api/v1/mcp/reload` - Reload MCP configuration
- `GET /api/v1/mcp/metrics` - Get MCP performance metrics

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `API_HOST` | Server host address | `0.0.0.0` |
| `API_PORT` | Server port number | `8000` |
| `CLAUDE_API_KEY` | Claude API authentication key | - |
| `CLAUDE_MODEL` | Claude model to use | `claude-4-sonnet` |
| `LOG_LEVEL` | Logging level | `INFO` |
| `LOG_FORMAT` | Log output format | `json` |
| `CORS_ORIGINS` | Allowed CORS origins | `*` |
| `RATE_LIMIT_PER_MINUTE` | API rate limiting | `60` |

#### Atlassian MCP Configuration
| Variable | Description | Example |
|----------|-------------|---------|
| `MCP_JIRA_SERVER_URL` | Jira server URL | `https://company.atlassian.net` |
| `MCP_JIRA_USERNAME` | Jira username/email | `user@company.com` |
| `MCP_JIRA_API_TOKEN` | Jira API token | `ATATT3x...` |
| `MCP_CONFLUENCE_SERVER_URL` | Confluence server URL | `https://company.atlassian.net/wiki` |
| `MCP_CONFLUENCE_USERNAME` | Confluence username/email | `user@company.com` |
| `MCP_CONFLUENCE_API_TOKEN` | Confluence API token | `ATATT3x...` |

### Supported MCP Servers

- **Atlassian MCP (mcp-atlassian)**: Comprehensive integration including:
  - **Jira**: Issue tracking, project management, agile boards, sprints
  - **Confluence**: Wiki pages, documentation management, comments, labels
  - Full CRUD operations for both platforms
  - Advanced features like worklog tracking, epic linking, version management

- **Serena MCP (mcp-serena)**: Advanced code analysis and development integration including:
  - **Code Analysis**: Symbol-level code exploration and manipulation
  - **Project Management**: Multi-project workspace support with memory persistence
  - **Intelligent Search**: Pattern matching, symbol finding, and reference tracking
  - **Code Editing**: Precise symbol-based editing with context awareness
  - **Shell Integration**: Command execution with project context
  - **Memory System**: Persistent knowledge storage for project insights

## Development

### Adding New Features

1. **Models**: Define data structures in `app/models.py`
2. **Services**: Implement business logic in `app/services/`
3. **Routes**: Create API endpoints in `app/routers/`
4. **Frontend**: Update UI in `frontend/`

### Running Tests

```bash
# Run all tests
pytest tests/

# Run with coverage
pytest --cov=app tests/

# Run specific test file
pytest tests/test_rate_limit.py

# Run integration tests (requires running server)
python tests/test_rate_limit.py
```

### Code Quality

```bash
# Format code
black app/
isort app/

# Lint code
flake8 app/
mypy app/
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Submit a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Documentation

- [Technical Documentation](./docs/) - Detailed implementation guides
- [API Documentation](http://localhost:8000/docs) - Interactive API docs (when server is running)
- [Test Documentation](./tests/README.md) - Testing guidelines and examples

## Changelog

### v1.2.0 (2025-09-24)

- **🎯 One-Click Deployment**: Added uvx support for easy installation and running
- **📋 Simplified Configuration**: User configuration via `~/.trendaiagent/env.conf`
- **🚀 Automatic Setup**: Integrated environment and Claude settings generation
- **🌐 Auto-Launch**: Automatic browser opening on startup
- **📦 Streamlined Installation**: No need for manual dependency management

#### What's New in uvx Deployment

- Users can now create a simple configuration file in their home directory
- Single command deployment: `uvx --from git+https://... claude-code-web-chat`
- Automatic generation of `.env` and Claude settings from user configuration
- Built-in web server startup with automatic browser launching
- All previous functionality maintained with simplified setup process

### v1.1.0 (2025-09-17)

- Added new pct_analysis_v2 mode for enhanced analysis capabilities
- Implemented API caching mechanism for improved performance
- Enhanced UI with breathing light effects and improved visual feedback
- Added true word-by-word streaming message output
- Optimized session management and fixed various session-related bugs
- Improved user interface with better shadows and visual effects
- Enhanced MCP status panel with breathing light feedback
- Added green end effect for thinking process animation
- Fixed session skipping after webpage refresh
- Removed cost output display to streamline interface

### v1.0.1 (2025-09-10)
- Enhanced session management and synchronization capabilities
- Improved MCP server health monitoring and auto-restart functionality
- Optimized user interface with better visual feedback and folding effects
- Refined logo and mode selection components for better user experience
- Enhanced annotation system with internationalization support
- Bug fixes and performance improvements

### v1.0.0 (2025-08-22)
- Initial release
- Basic Claude Code integration
- Web interface and API