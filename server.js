// server.js
// Main Express server setup for the Focal Point application.
// Loads environment variables, configures middleware, sets up routes, and initializes the app.
require('dotenv').config();

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is not set in your environment variables (.env file)');
}

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const sharp = require('sharp');
const db = require('./db');
const bcrypt = require('bcryptjs');
const backupUtils = require('./utils/backup');
const Database = require('better-sqlite3');
const marked = require('marked');
const {
  createClient,
  verifyClient,
  getClientImages,
  addClientImage,
  deleteClientImage,
  getAllClients,
  getClientById,
  deleteClient,
  toggleClientStatus,
  incrementDownloadCount,
  createZipArchive,
  CLIENT_UPLOADS_DIR
} = require('./utils/clients');

const {
  getCategoriesWithPreviews,
  getCategoriesWithImages,
  isSafeCategory,
  getOrderedImages,
  categoryExists,
  createCategory,
  deleteCategory,
  deleteImage,
  saveImageOrder,
  setCategoryThumbnail,
  adminExists,
  createAdmin,
  getAdmin,
  verifyAdmin,
  updateAltText,
  addImage,
  getCategoryIdAndMaxPosition,
  getSetting,
  setSetting,
  getAllSettings
} = require('./utils');
const adminRoutes = require('./routes/admin');
const clientRoutes = require('./routes/client');
const mainRoutes = require('./routes/main');
const app = express();

// Set trust proxy from environment variable (default: 0/false)
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy !== undefined) {
  // If it's a number, use as number; if "true", use true; if "false", use false
  if (trustProxy === "true") {
    app.set('trust proxy', true);
  } else if (trustProxy === "false" || trustProxy === "0") {
    app.set('trust proxy', false);
  } else if (!isNaN(Number(trustProxy))) {
    app.set('trust proxy', Number(trustProxy));
  } else {
    app.set('trust proxy', trustProxy); // fallback for advanced trust proxy settings
  }
}

const { getCachedCategories, invalidateCategoryCache } = require('./utils/categoryCache');

// --- RATE LIMITERS --- //
// Login rate limiter to prevent brute force attacks
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many login attempts from this IP, please try again after 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Admin rate limiter to prevent abuse of admin endpoints
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again after 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
});
// --- END RATE LIMITERS --- //

// Set up EJS templating engine and views directory
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files from /public (moved after dynamic routes to avoid overriding)

// Redirect to /setup if admin account doesn't exist and not already on /setup/static assets or public API endpoints
app.use((req, res, next) => {
  if (
    !adminExists() &&
    req.path !== '/setup' &&
    req.path !== '/setup/' &&
    !req.path.startsWith('/public') &&
    !req.path.startsWith('/styles') &&
    !req.path.startsWith('/images') &&
    !req.path.startsWith('/favicon') &&
    !req.path.startsWith('/branding') &&
    !req.path.startsWith('/manifest') &&
    !req.path.startsWith('/api') && // Ensure public API endpoints are not blocked
    req.method === 'GET'
  ) {
    return res.redirect('/setup');
  }
  next();
});

// Inject settings with fallbacks into res.locals for all views
app.use((req, res, next) => {
  let settings = getAllSettings() || {};
  settings.siteTitle = settings.siteTitle || 'Focal Point';
  settings.headerTitle = settings.headerTitle || 'Focal Point';
  settings.favicon = typeof settings.favicon === 'string' ? settings.favicon : '';
  settings.accentColor = settings.accentColor || '#2ecc71';
  settings.headerType = settings.headerType || 'text';
  res.locals.settings = settings;
  next();
});

// Serve static images from /data/images at /images URL
app.use('/images', express.static(path.join(__dirname, 'data/images')));
// Serve static client images from /data/client-uploads at /client-images URL
app.use('/client-images', express.static(path.join(__dirname, 'data/client-uploads')));

// Serve the /data directory as /branding
app.use('/branding', express.static(path.join(__dirname, 'data')));

// Serve client-uploaded images at /uploads/:clientId/:filename
app.get('/uploads/:clientId/:filename', (req, res) => {
  const clientId = req.params.clientId;
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'data', 'client-uploads', clientId, filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('Image not found');
  }
});

// Parse URL-encoded bodies (for login form, etc.)
app.use(express.urlencoded({ extended: true }));

// Parse JSON bodies (for AJAX, API, etc.)
app.use(express.json());

// Session middleware for login state
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // only over HTTPS in prod
    sameSite: 'lax'
  }
}));

// Ensure the temporary upload directory exists
const tmpDir = path.join(__dirname, 'public/images/tmp');
fs.mkdirSync(tmpDir, { recursive: true });

// Ensure the permanent temp folder exists
const tempDir = path.join(__dirname, 'temp');
fs.mkdirSync(tempDir, { recursive: true });

// Configure Multer for file uploads (uploads go to tmp folder first)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'public/images/tmp'));
  },
  filename: function (req, file, cb) {
    // Get the file extension
    const ext = path.extname(file.originalname);
    // Generate a uuid filename with the original extension
    cb(null, uuidv4() + ext);
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Ensure the uploads directory exists
const uploadsDir = path.join(__dirname, 'public/uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const settingsUpload = multer({
  dest: uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Clean up tmp folder: delete files older than 1 hour
function cleanTmpFolder() {
  const tmpDir = path.join(__dirname, 'public/images/tmp');
  const cutoff = Date.now() - 60 * 60 * 1000; // 1 hour ago
  fs.readdir(tmpDir, (err, files) => {
    if (err) return;
    files.forEach(file => {
      const filePath = path.join(tmpDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        if (stats.isFile() && stats.mtimeMs < cutoff) {
          fs.unlink(filePath, () => { });
        }
      });
    });
  });
}

// Run cleanup every hour
const cleanupInterval = setInterval(cleanTmpFolder, 60 * 60 * 1000);
cleanupInterval.unref(); // Prevents Jest from hanging due to open handles
// Also run at startup
cleanTmpFolder();

// Helper to get file type
async function getFileType(filePath) {
  const { fileTypeFromFile } = await import('file-type');
  return fileTypeFromFile(filePath);
}

// --- AUTO-CREATE ADMIN FOR TESTS ---
// Generates a random string for test admin credentials
function randomString(len = 12) {
  return crypto.randomBytes(len).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, len);
}

const envTestPath = path.join(__dirname, '.env.test');

let testAdminReady = Promise.resolve();

if (process.env.NODE_ENV === 'test') {
  if (!adminExists()) {
    const testUser = randomString(8);
    const testPass = randomString(16);
    testAdminReady = createAdmin(testUser, testPass)
      .then(() => {
        const envContent = `TEST_ADMIN_USER=${testUser}\nTEST_ADMIN_PASS=${testPass}\n`;
        fs.writeFileSync(envTestPath, envContent, { encoding: 'utf8' });
      })
      .catch(err => {
        console.error('Failed to create test admin:', err);
      });
  }
}

// Serve static files from /public (moved earlier to improve response times)
app.use(express.static(path.join(__dirname, 'public')));

// Use client routes
app.use('/client', clientRoutes);

// Use admin routes
app.use('/admin', adminRoutes);

// Use main routes (homepage, gallery, manifest, 404)
app.use('/', mainRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  } else {
    res.status(500).send(`
      <h1>Server Error</h1>
      <p>Something broke! Please try again later.</p>
      <a href="/">Back to Home</a>
    `);
  }
});

// Only start the server if this file is run directly, not when required for tests
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

module.exports = app;
module.exports.testAdminReady = testAdminReady;