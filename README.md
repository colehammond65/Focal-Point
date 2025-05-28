# 📸 FocalPoint

A simple and elegant Node.js/Express photo gallery with admin panel for photography freelancers to showcase their portfolio and manage client galleries.

## 🚀 Quick Start

### Option 1: Docker (Recommended)

#### Using Docker Compose
1. Clone the repository:
```sh
git clone <your-repo-url>
cd focalpoint
```

2. Edit `docker-compose.yml` with your environment variables
3. Start the application:
```sh
docker-compose up -d
```

#### Using Docker directly
```sh
git clone <your-repo-url>
cd focalpoint
docker build -t focalpoint .
docker run -p 3000:3000 \
  -v $(pwd)/images:/home/node/app/public/images \
  -v $(pwd)/data:/home/node/app/data \
  -e SESSION_SECRET=your-secret-here \
  -e TRUST_PROXY=1 \
  focalpoint
```

### Option 2: Local Development

#### 1. Clone and Install
```sh
git clone <your-repo-url>
cd focalpoint
npm install
```

#### 2. Environment Setup
Create a `.env` file in the root directory:
```env
SESSION_SECRET=your-super-secret-random-string-here
TRUST_PROXY=false
```

#### 3. Start the Application
```sh
# Production
npm start

# Development (with auto-reload)
npm run dev
```

**Visit `http://localhost:3000` to see your gallery!**

## 📋 Usage

- **Admin Panel**: Visit `/admin` to manage images and categories
- **Image Storage**: Images are organized in `public/images/<category>/`
- **Categories**: Each folder in `public/images/` becomes a category
- **Database**: SQLite database stored in `data/gallery.db`

## 📁 Project Structure

```
focalpoint/
├── 📂 public/              # Static files and images
│   └── 📂 images/          # Image storage (categories as folders)
├── 📂 data/                # Database storage
│   └── 📄 gallery.db       # SQLite database
├── 📂 views/               # EJS templates
├── 📂 migrations/          # Database migration scripts
├── 📄 utils.js             # Database and helper functions
├── 📄 server.js            # Main application server
├── 📄 docker-compose.yml   # Docker composition
├── 📄 Dockerfile           # Docker build instructions
└── 📄 .env                 # Environment configuration
```

## 🐳 Docker Configuration

### Environment Variables
Edit `docker-compose.yml` or pass as environment variables:
- `SESSION_SECRET` – **Required** random string for session security
- `TRUST_PROXY` – Set to `1` if running behind a reverse proxy (Nginx, Cloudflare Tunnel, etc.)

### 💾 Persistent Storage
- `./images` → `/home/node/app/public/images` (your photos)
- `./data` → `/home/node/app/data` (database)

Both directories are automatically created and persist across container restarts.

### Docker Commands
```sh
# Start the application
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the application
docker-compose down

# Rebuild after changes
docker-compose up --build -d
```

## 🔒 Security Notes

- ✅ Set a **strong, random** `SESSION_SECRET`
- ✅ Use `TRUST_PROXY=1` when behind a reverse proxy
- ⚠️ **Never** serve the `data/` folder as static content
- ⚠️ Only the `public/` folder should be web-accessible

## 🚫 Ignored Files

The following directories are excluded from Git and Docker builds:
- `images/` - Your photo collection
- `data/` - Database files

## 📝 License

MIT License - Feel free to use this project for personal or commercial purposes.

---

*Built with ❤️ using Node.js, Express, and SQLite*
