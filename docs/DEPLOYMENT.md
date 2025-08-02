# Deployment and Development Guide

## Table of Contents
- [Development Setup](#development-setup)
- [Production Deployment](#production-deployment)
- [Docker Deployment](#docker-deployment)
- [CI/CD Pipeline](#cicd-pipeline)
- [Environment Configuration](#environment-configuration)
- [Database Management](#database-management)
- [Monitoring and Logging](#monitoring-and-logging)
- [Troubleshooting](#troubleshooting)

---

## Development Setup

### Prerequisites
- Node.js 18+ (recommended: 20+)
- npm or yarn package manager
- Git for version control

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/colehammond65/Focal-Point.git
   cd Focal-Point
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment setup**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Access the application**
   - Main gallery: `http://localhost:3000`
   - Admin panel: `http://localhost:3000/admin`

### Development Tools

#### Available Scripts
- `npm run dev` - Start development server with hot reload
- `npm start` - Start production server
- `npm test` - Run test suite
- `npm audit` - Check for security vulnerabilities

#### Database Management
- Database file: `data/gallery.db` (auto-created)
- Migrations: Located in `migrations/` directory
- Reset database: Delete `data/gallery.db` and restart server

---

## Production Deployment

### Server Requirements
- **OS**: Ubuntu 20.04+ / CentOS 8+ / Docker-compatible system
- **Memory**: Minimum 512MB RAM, recommended 1GB+
- **Storage**: 10GB+ for photos and database
- **Node.js**: Version 18+ 

### Manual Deployment

1. **Prepare the server**
   ```bash
   # Install Node.js
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   
   # Install PM2 for process management
   sudo npm install -g pm2
   ```

2. **Deploy application**
   ```bash
   # Clone and install
   git clone https://github.com/colehammond65/Focal-Point.git
   cd Focal-Point
   npm ci --production
   
   # Set up environment
   cp .env.example .env
   # Edit .env with production values
   ```

3. **Configure environment variables**
   ```env
   SESSION_SECRET=your-super-secure-random-string-here
   TRUST_PROXY=1
   NODE_ENV=production
   PORT=3000
   ```

4. **Start with PM2**
   ```bash
   pm2 start server.js --name "focal-point"
   pm2 startup
   pm2 save
   ```

5. **Set up reverse proxy (Nginx)**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

---

## Docker Deployment

### Quick Start with Docker Compose

1. **Create docker-compose.yml**
   ```yaml
   version: '3.8'
   services:
     focal-point:
       image: colehammond65/focal-point:latest
       ports:
         - "3000:3000"
       environment:
         - SESSION_SECRET=your-secure-secret-here
         - TRUST_PROXY=1
         - NODE_ENV=production
       volumes:
         - ./data:/home/node/app/data
       restart: unless-stopped
   ```

2. **Start the application**
   ```bash
   docker-compose up -d
   ```

### Building Custom Image

1. **Build locally**
   ```bash
   docker build -t focal-point .
   ```

2. **Run container**
   ```bash
   docker run -d \
     --name focal-point \
     -p 3000:3000 \
     -e SESSION_SECRET=your-secret \
     -e TRUST_PROXY=1 \
     -v $(pwd)/data:/home/node/app/data \
     focal-point
   ```

### Docker Health Checks

The container includes health checks that verify:
- Application is responding on port 3000
- Database connection is working
- Required directories exist

---

## CI/CD Pipeline

### GitHub Actions Workflow

The repository includes a comprehensive CI/CD pipeline that:

1. **Test Phase**
   - Runs on every push and pull request
   - Installs dependencies
   - Runs security audit
   - Executes test suite
   - Performs code quality checks

2. **Build Phase** (main branch only)
   - Builds Docker image
   - Pushes to Docker Hub
   - Tags with latest

3. **Security Scanning**
   - Scans for vulnerabilities with Trivy
   - Uploads results to GitHub Security tab

### Setting up CI/CD

1. **Configure secrets in GitHub**
   - `DOCKERHUB_USERNAME`: Your Docker Hub username
   - `DOCKERHUB_TOKEN`: Docker Hub access token

2. **Workflow triggers**
   - Push to main branch: Full pipeline
   - Pull requests: Tests and security only
   - Manual dispatch: Available for manual runs

### Deployment Strategies

#### Blue-Green Deployment
```bash
# Terminal 1: Start new version
docker run -d --name focal-point-green -p 3001:3000 focal-point:latest

# Verify new version
curl http://localhost:3001/health

# Terminal 2: Switch traffic (update load balancer)
# Stop old version
docker stop focal-point-blue
```

#### Rolling Updates
```bash
# Update with PM2
pm2 reload focal-point
```

---

## Environment Configuration

### Required Variables
```env
# Security (Required)
SESSION_SECRET=random-64-character-string

# Server Configuration
PORT=3000
NODE_ENV=production
TRUST_PROXY=1

# Optional Features
LOG_LEVEL=info
BACKUP_RETENTION_DAYS=30
```

### Security Best Practices

1. **Session Secret**
   - Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - Never reuse across environments
   - Rotate periodically

2. **Trust Proxy**
   - Set to `1` when behind reverse proxy (Nginx, Cloudflare)
   - Set to `false` for direct access

3. **File Permissions**
   ```bash
   chmod 600 .env
   chmod -R 755 public/
   chmod -R 700 data/
   ```

---

## Database Management

### Backup and Restore

#### Automatic Backups
- Available through admin interface
- Configurable retention period
- Includes database and uploaded images

#### Manual Database Backup
```bash
# Create backup
cp data/gallery.db data/backup-$(date +%Y%m%d).db

# Restore from backup
cp data/backup-20240101.db data/gallery.db
```

### Migration Management

#### Running Migrations
```bash
# Migrations run automatically on startup
# To manually check migration status:
node -e "
const db = require('./db');
db.ready.then(() => {
  console.log('Database ready');
  process.exit(0);
});
"
```

#### Creating New Migrations
1. Create file in `migrations/` directory
2. Follow naming convention: `YYYY.MM.DD.T.HH.mm.ss.description.js`
3. Include both `up` and `down` methods

---

## Monitoring and Logging

### Application Logging

The application uses Winston for structured logging:
- **Development**: Console output with colors
- **Production**: Rotating file logs in `logs/` directory

#### Log Levels
- `error`: Application errors and exceptions
- `warn`: Warning conditions
- `info`: General information
- `debug`: Detailed debugging information

#### Log Files
- `logs/application-%DATE%.log`: General application logs
- `logs/error-%DATE%.log`: Error-only logs

### Health Monitoring

#### Health Check Endpoint
```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z",
  "uptime": 3600,
  "database": "connected"
}
```

#### Monitoring with PM2
```bash
pm2 monit focal-point
pm2 logs focal-point
```

### Performance Monitoring

#### Key Metrics to Monitor
- Response time for image serving
- Memory usage (should remain stable)
- Disk usage (grows with uploaded photos)
- Database query performance

---

## Troubleshooting

### Common Issues

#### "SESSION_SECRET not set" Error
```bash
# Check environment variables
printenv | grep SESSION_SECRET

# If missing, add to .env:
echo "SESSION_SECRET=$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')" >> .env
```

#### Database Connection Issues
```bash
# Check database file permissions
ls -la data/gallery.db

# Recreate database (WARNING: destroys data)
rm data/gallery.db
npm start  # Will recreate with migrations
```

#### Image Upload Failures
```bash
# Check disk space
df -h

# Check directory permissions
ls -la public/images/
ls -la data/client-uploads/

# Fix permissions
chmod -R 755 public/images/
chmod -R 700 data/client-uploads/
```

#### Memory Issues
```bash
# Check memory usage
free -h
ps aux | grep node

# Restart application
pm2 restart focal-point
```

### Performance Issues

#### Slow Image Loading
1. **Enable compression in reverse proxy**
2. **Implement image CDN**
3. **Optimize image sizes**

#### Database Performance
1. **Regular VACUUM operations**
   ```sql
   VACUUM;
   ANALYZE;
   ```
2. **Monitor query performance**
3. **Consider read replicas for high traffic**

### Log Analysis

#### Finding Errors
```bash
# Search recent errors
tail -f logs/error-$(date +%Y-%m-%d).log

# Search for specific patterns
grep -i "error" logs/application-*.log
grep -i "upload" logs/application-*.log
```

#### Performance Analysis
```bash
# Response time analysis
grep "ms$" logs/application-*.log | sort -k4 -n

# Most accessed endpoints
grep "GET\|POST" logs/application-*.log | cut -d' ' -f3 | sort | uniq -c | sort -nr
```

---

## Support and Maintenance

### Regular Maintenance Tasks

#### Daily
- Check disk space
- Review error logs
- Verify backup completion

#### Weekly
- Security audit: `npm audit`
- Update dependencies: `npm update`
- Database cleanup: Remove old logs

#### Monthly
- Rotate logs manually if needed
- Review and archive old backups
- Update system packages

### Getting Help

1. **Check logs** first for error details
2. **Review documentation** for configuration options
3. **Search issues** in the GitHub repository
4. **Create new issue** with:
   - Environment details
   - Error logs
   - Steps to reproduce

---

This guide covers the essential aspects of deploying and maintaining the Focal Point application. For additional support, refer to the project repository or create an issue for specific problems.