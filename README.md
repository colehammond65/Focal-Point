# 📸 FocalPoint

A modern Node.js/Express photo gallery and client delivery system with an admin panel for photographers. Features private client galleries, a customizable About page, and flexible site settings.

---

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

---

## 📋 Features & Usage

- **Admin Panel**: `/admin` for managing images, categories, About page, site settings, and client galleries
- **Client Galleries**: Create private galleries for clients, with login, download tracking, and zip download
- **About Page**: Markdown-powered About page with optional image, editable in admin
- **Site Settings**: Change site title, accent color, favicon, and more from the admin panel
- **Image Storage**: Images organized in `public/images/<category>/` (public) and `data/client-uploads/` (private)
- **Categories**: Each folder in `public/images/` is a category; supports drag-and-drop ordering
- **Database**: SQLite database stored in `data/gallery.db`
- **EJS Templates**: All views are rendered with EJS and customizable
- **Security**: Session-based admin login, rate limiting, and secure static file serving

---

## 📁 Project Structure

```
focalpoint/
├── public/                # Static files and images
│   ├── images/            # Public image storage (categories as folders)
│   ├── uploads/           # Favicon and branding uploads
│   └── js/                # Client-side JS
├── data/                  # Database and client uploads
│   ├── gallery.db         # SQLite database
│   ├── client-uploads/    # Private client gallery images
│   └── backups/           # Database backups
├── views/                 # EJS templates
├── migrations/            # Database migration scripts
├── utils/                 # Helper modules (admin, categories, images, settings, backup, etc.)
├── temp/                  # Temporary files (zip archives, etc.)
├── routes/                # Express route handlers
├── server.js              # Main application server
├── docker-compose.yml     # Docker composition
├── Dockerfile             # Docker build instructions
└── .env                   # Environment configuration
```

---

## 🐳 Docker Configuration

### Environment Variables
Edit `docker-compose.yml` or pass as environment variables:
- `SESSION_SECRET` – **Required** random string for session security
- `TRUST_PROXY` – Set to `1` if running behind a reverse proxy (Nginx, Cloudflare Tunnel, etc.)

### 💾 Persistent Storage
- `./images` → `/home/node/app/public/images` (your photos)
- `./data` → `/home/node/app/data` (database, client uploads)

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

---

## 🔒 Security Notes

- ✅ Set a **strong, random** `SESSION_SECRET`
- ✅ Use `TRUST_PROXY=1` when behind a reverse proxy
- ⚠️ **Never** serve the `data/` folder as static content
- ⚠️ Only the `public/` folder should be web-accessible
- ⚠️ Client galleries are private and require login

---

## 🚫 Ignored Files

The following directories are excluded from Git and Docker builds:
- `images/` - Your photo collection
- `data/` - Database and client uploads
- `temp/` - Temporary files

---

## 📝 License

MIT License - Feel free to use this project for personal or commercial purposes.

---

*Built with ❤️ using Node.js, Express, EJS, and SQLite*
