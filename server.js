// server.js
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
const archiver = require('archiver');
const unzipper = require('unzipper');
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

let categoryCache = null;
let categoryCacheTime = 0;
const CATEGORY_CACHE_TTL = 10000; // 10 seconds

async function getCachedCategories() {
  const now = Date.now();
  if (!categoryCache || now - categoryCacheTime > CATEGORY_CACHE_TTL) {
    categoryCache = await getCategoriesWithPreviews();
    categoryCacheTime = now;
  }
  return categoryCache;
}

function invalidateCategoryCache() {
  categoryCache = null;
  categoryCacheTime = 0;
}

// --- RATE LIMITERS --- //
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many login attempts from this IP, please try again after 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
});

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

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));

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

// Serve dynamic styles.css with accent color injection
app.get('/styles.css', (req, res) => {
  const settings = getAllSettings();
  const accentColor = settings.accentColor || '#2ecc71';
  // Simple function to darken the accent color for hover (10% darker)
  function darken(hex, amt = 0.1) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    let num = parseInt(c, 16);
    let r = Math.max(0, ((num >> 16) & 0xff) * (1 - amt));
    let g = Math.max(0, ((num >> 8) & 0xff) * (1 - amt));
    let b = Math.max(0, (num & 0xff) * (1 - amt));
    return `#${((1 << 24) + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1)}`;
  }
  const accentHover = darken(accentColor, 0.15);
  let css = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');
  // Inject CSS variables
  css = css.replace(
    /\/\* ACCENT_COLOR_INJECT \*\/[\s\S]*?--primary-hover:.*?;/,
    `/* ACCENT_COLOR_INJECT */\n    --primary-color: ${accentColor};\n    --primary-hover: ${accentHover};`
  );
  // Replace all hardcoded green values with the variable
  css = css.replace(/#2ecc71/gi, 'var(--primary-color)');
  css = css.replace(/#27ae60/gi, 'var(--primary-hover)');
  // Also replace rgba(46, 204, 113, x) with a fallback to the accent color (approximate)
  css = css.replace(/rgba\(46, 204, 113, ([0-9.]+)\)/gi, (m, a) => `rgba(var(--primary-color-rgb, 46,204,113), ${a})`);
  // Optionally, inject the RGB version for advanced use
  const rgb = accentColor.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (rgb) {
    css = css.replace('/* ACCENT_COLOR_INJECT */', `/* ACCENT_COLOR_INJECT */\n    --primary-color-rgb: ${parseInt(rgb[1], 16)},${parseInt(rgb[2], 16)},${parseInt(rgb[3], 16)};`);
  }
  res.setHeader('Content-Type', 'text/css');
  res.send(css);
});

// Serve static images from /public/images at /images URL
app.use('/images', express.static(path.join(__dirname, 'public/images')));

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