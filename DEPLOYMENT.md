# Deployment Guide

## Local Development Setup

### Prerequisites
- Node.js/npm for browser compatibility checking
- Python 3.9+
- Chrome or Firefox for testing

### Quick Start

1. **Server Setup**
   ```bash
   cd server
   python -m venv venv
   source venv/bin/activate  # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   python main.py
   ```

2. **Extension Setup**
   - Chrome: Load unpacked from `extension/` folder
   - Firefox: Temporary add-on from `extension/manifest.json`

3. **Test Connection**
   - Open popup panel (Privacy Agent icon)
   - Configure server URL to `http://localhost:8000`
   - Click "Process Now" to test

## Production Deployment

### Option 1: Docker Deployment

Create `Dockerfile` in server/:
```dockerfile
FROM python:3.9-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY main.py .
CMD ["python", "main.py"]
```

Build and run:
```bash
docker build -t privacy-agent-server .
docker run -p 8000:8000 privacy-agent-server
```

### Option 2: Cloud Deployment (AWS)

1. **EC2 Instance**
   ```bash
   # SSH into instance
   ssh -i key.pem ec2-user@instance-ip
   
   # Clone repo and setup
   git clone [repo-url]
   cd Privacy_Browser_Agent/server
   sudo apt update && sudo apt install python3-pip
   pip install -r requirements.txt
   
   # Use PM2 or systemd for persistence
   ```

2. **API Gateway + Lambda**
   - Package as serverless function
   - Set up environment variables
   - Configure rate limiting

3. **Environment Variables**
   ```bash
   export LOG_LEVEL=INFO
   export MAX_CONCURRENT_SESSIONS=100
   export CACHE_TTL=3600
   ```

### Option 3: Google Cloud Run

```bash
gcloud run deploy privacy-agent-server \
  --source . \
  --platform managed \
  --memory 512Mi \
  --timeout 60
```

## SSL/TLS Configuration

For production, always use HTTPS:

```python
# main.py - Add SSL context
import ssl
ssl_context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
ssl_context.load_cert_chain("cert.pem", "key.pem")

uvicorn.run(
    app,
    host="0.0.0.0",
    port=8443,
    ssl_keyfile="key.pem",
    ssl_certfile="cert.pem"
)
```

## Nginx Reverse Proxy

```nginx
upstream privacy_agent {
    server 127.0.0.1:8000;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://privacy_agent;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Database Setup (Optional)

For production with persistence:

```python
# Add SQLAlchemy for database
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

DATABASE_URL = "postgresql://user:password@localhost/privacy_agent"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
```

## Monitoring

### Application Monitoring
```bash
# Install monitoring tools
pip install prometheus-client
pip install sentry-sdk

# Add to main.py
from prometheus_client import Counter, Histogram
from sentry_sdk import init as sentry_init

sentry_init("your-sentry-dsn")
```

### Health Check
```bash
# Automated health checks
watch -n 30 'curl -s http://localhost:8000/health | jq'
```

## Scaling

### Horizontal Scaling
- Use load balancer (Nginx, HAProxy, or cloud-native)
- Run multiple server instances
- Share state via Redis cache

### Vertical Scaling
- Increase machine resources
- Optimize Python performance
- Use async workers (uvicorn workers parameter)

## Logging

### Centralized Logging
```python
# Send logs to ELK stack or CloudWatch
import logging.handlers

handler = logging.handlers.SysLogHandler(address=('localhost', 514))
logger.addHandler(handler)
```

### Log Levels
- DEBUG: Detailed diagnostic information
- INFO: General application flow
- WARNING: Warning messages
- ERROR: Error conditions
- CRITICAL: Critical errors

## Backup & Recovery

### Backup Strategy
```bash
# Backup extension configuration
tar -czf extension-backup-$(date +%s).tar.gz extension/

# Backup server logs
tar -czf server-logs-$(date +%s).tar.gz /var/log/privacy-agent/
```

## Security Hardening

1. **Dependencies**
   ```bash
   pip install safety
   safety check
   ```

2. **Code Scanning**
   ```bash
   pip install bandit
   bandit -r server/
   ```

3. **CORS Configuration**
   - Whitelist specific origins in production
   - Set appropriate headers

4. **Rate Limiting**
   ```python
   from slowapi import Limiter
   limiter = Limiter(key_func=get_remote_address)
   
   @app.post("/api/process-screen")
   @limiter.limit("30/minute")
   async def process_screen(request: ProcessScreenRequest):
       ...
   ```

## Performance Tuning

### Uvicorn Configuration
```bash
# Multiple worker processes
uvicorn main.py --workers 4 --worker-class uvicorn.workers.UvicornWorker
```

### Caching
```python
from functools import lru_cache

@lru_cache(maxsize=128)
def get_config():
    ...
```

## Troubleshooting Deployment

### Port Already in Use
```bash
# Find and kill process
lsof -i :8000
kill -9 <PID>
```

### CORS Issues
- Verify allow_origins in CORSMiddleware
- Check browser console for specific error
- Add x-origin-request-header debug logging

### High Memory Usage
- Check for memory leaks in image processing
- Limit concurrent requests
- Implement request queuing

## Rollback Procedure

```bash
# Keep previous version
mv app-current app-backup

# Restore previous
cp -r app-previous app-current
systemctl restart privacy-agent
```

## Post-Deployment Checklist

- [ ] Server health check passing
- [ ] CORS headers correct
- [ ] SSL/TLS configured
- [ ] Logging enabled
- [ ] Monitoring set up
- [ ] Backups configured
- [ ] Documentation updated
- [ ] Team trained on deployment
