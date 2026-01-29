# Rate Limiting Implementation

*Updated for Claude Code Web Chat v1.1.0*

## Overview
Successfully implemented API rate limiting functionality based on `slowapi`. Request frequency can now be controlled through the `RATE_LIMIT_PER_MINUTE` environment variable in the `.env` file. This feature is part of the v1.1.0 release improvements.

## Implemented Features

### 1. Environment Variable Configuration
- `RATE_LIMIT_PER_MINUTE`: Maximum number of requests allowed per minute (default: 60)

### 2. Core Components

#### a) Rate Limiting Utility (`app/utils/rate_limiter.py`)
- Dynamic environment variable configuration reading
- Intelligent client IP identification (supports proxy forwarding)
- Custom 429 error response format
- HTTP headers with retry information

#### b) Main Application Integration (`app/main.py`)
- Added slowapi dependency imports
- Registered global exception handlers
- Bound limiter to application state

#### c) API Route Protection
**Query Endpoints** (`app/routers/query.py`):
- `POST /api/v1/query` - Rate limiting applied
- `POST /api/v1/query/stream` - Rate limiting applied

**MCP Management Endpoints** (`app/routers/mcp.py`):
- `POST /api/v1/mcp/servers/{name}/start` - Stricter rate limiting applied (10/minute)

### 3. Dependency Updates
Added to `requirements.txt`:
```
slowapi==0.1.9
```

## Configuration and Usage

### Environment Variable Setup
Configure in the `.env` file:
```bash
# Allow 60 requests per minute
RATE_LIMIT_PER_MINUTE=60

# Or stricter limits
RATE_LIMIT_PER_MINUTE=30
```

### Client IP Identification
Supports the following HTTP headers for client identification:
- `X-Forwarded-For` (proxy forwarding)
- `X-Real-IP` (Nginx, etc.)
- Direct connection IP

## Error Response Format

When rate limit is exceeded, returns:
```json
{
  "error": "Rate limit exceeded",
  "message": "Too many requests. Limit: 60/minute",
  "retry_after": 60
}
```

HTTP Status Code: `429 Too Many Requests`
HTTP Header: `Retry-After: 60`

## Testing

### Install Dependencies
```bash
pip install slowapi==0.1.9
```

### Run Tests
```bash
# Start the server
python app/main.py

# Run tests in another terminal
python tests/test_rate_limit.py
```

## Technical Features

1. **Dynamic Configuration**: Real-time rate limit adjustment through environment variables
2. **Intelligent IP Identification**: Client identification support in proxy environments
3. **Graceful Degradation**: Meaningful error messages for rate-limited requests
4. **Layered Limiting**: Different rate limits for different types of endpoints
5. **Production Ready**: Support for distributed deployment and load balancing

## Important Notes

1. Rate limiting is based on memory storage; counters reset after service restart
2. In cluster environments, each instance calculates rate limits independently
3. For shared state, can be extended to use external storage like Redis
4. Recommend configuring basic rate limiting at reverse proxy layer (e.g., Nginx)

## Future Optimization Suggestions

1. Add Redis support for distributed rate limiting
2. Implement differentiated limits based on users/API keys
3. Add rate limiting monitoring and alerting
4. Support dynamic limit adjustment (without service restart)

---

*This documentation is part of Claude Code Web Chat v1.1.0 release documentation.*