// server.js
// Main Express server setup for the Focal Point application.
// Loads environment variables, configures middleware, sets up routes, and initializes the app.
require('dotenv').config();

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is not set in your environment variables (.env file)');
}

const express = require('express');
const helmet = require('helmet');
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
const logger = require('./utils/logger');
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
  cleanupExpiredClients,
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

app.use(helmet());

// Set trust proxy from environment variable (default: 0/false)
app.set('trust proxy', process.env.TRUST_PROXY === '1');

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
app.use(async (req, res, next) => {
  try {
    const exists = await adminExists();
    if (
      !exists &&
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
  } catch (err) {
    console.error('Error in adminExists redirect middleware:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Inject settings with fallbacks into res.locals for all views
app.use(async (req, res, next) => {
  try {
    let settings = await getAllSettings() || {};
    settings.siteTitle = settings.siteTitle || 'Focal Point';
    settings.headerTitle = settings.headerTitle || 'Focal Point';
    settings.favicon = typeof settings.favicon === 'string' ? settings.favicon : '';
    settings.accentColor = settings.accentColor || '#2ecc71';
    settings.headerType = settings.headerType || 'text';
    res.locals.settings = settings;
    next();
  } catch (err) {
    console.error('Error loading settings:', err);
    // Provide fallback settings if database is not ready
    res.locals.settings = {
      siteTitle: 'Focal Point',
      headerTitle: 'Focal Point',
      favicon: '',
      accentColor: '#2ecc71',
      headerType: 'text'
    };
    next();
  }
});

// Set a more permissive CSP for inline scripts for development (customize for production)
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:" // allow data: for previews
    ].join('; ')
  );
  next();
});

// Serve static images from /data/images at /images URL with cache headers
app.use('/images', express.static(path.join(__dirname, 'data/images'), {
  maxAge: '30d', // Cache for 30 days
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
  }
}));
// Serve static client images from /data/client-uploads at /client-images URL with cache headers
app.use('/client-images', express.static(path.join(__dirname, 'data/client-uploads'), {
  maxAge: '30d',
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
  }
}));
// Serve the /data directory as /branding with cache headers
app.use('/branding', express.static(path.join(__dirname, 'data'), {
  maxAge: '30d',
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
  }
}));

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

// Serve About image from /data by filename
app.get('/about-image/:filename', (req, res) => {
  const filename = req.params.filename;
  // Only allow safe filenames
  if (!/^[\w.-]+$/.test(filename)) return res.status(400).send('Invalid filename');
  const filePath = path.join(__dirname, 'data', filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('Image not found');
  }
});

// Optimized image serving with sharp (on-the-fly resizing)
app.get('/images/:category/:filename', async (req, res) => {
  const { category, filename } = req.params;
  const width = parseInt(req.query.w, 10);
  const height = parseInt(req.query.h, 10);
  
  // Validate filename to prevent directory traversal
  if (!/^[\w.-]+$/.test(filename) || !/^[\w-]+$/.test(category)) {
    return res.status(400).send('Invalid filename or category');
  }
  
  // Validate image dimensions
  if ((width && (width < 1 || width > 2000)) || (height && (height < 1 || height > 2000))) {
    return res.status(400).send('Invalid image dimensions');
  }
  
  const origPath = path.join(__dirname, 'data/images', category, filename);
  if (!fs.existsSync(origPath)) return res.status(404).send('Image not found');

  // Only process if width or height is specified
  if (width || height) {
    try {
      // Optional: cache processed images
      const cacheDir = path.join(__dirname, 'public/images/tmp', category);
      fs.mkdirSync(cacheDir, { recursive: true });
      const cacheName = `${path.parse(filename).name}_${width || ''}x${height || ''}${path.extname(filename)}`;
      const cachePath = path.join(cacheDir, cacheName);
      if (fs.existsSync(cachePath)) {
        return res.sendFile(cachePath);
      }
      let transformer = sharp(origPath);
      if (width || height) transformer = transformer.resize(width || null, height || null, { fit: 'inside' });
      await transformer.toFile(cachePath);
      return res.sendFile(cachePath);
    } catch (err) {
      logger.error('Error processing image:', err);
      return res.status(500).send('Error processing image');
    }
  } else {
    return res.sendFile(origPath);
  }
});

// Optimized client image serving with sharp (on-the-fly resizing)
app.get('/client-images/:clientId/:filename', async (req, res) => {
  const { clientId, filename } = req.params;
  const width = parseInt(req.query.w, 10);
  const height = parseInt(req.query.h, 10);
  
  // Validate parameters to prevent directory traversal
  if (!/^[\w.-]+$/.test(filename) || !/^[\w-]+$/.test(clientId)) {
    return res.status(400).send('Invalid filename or client ID');
  }
  
  // Validate image dimensions
  if ((width && (width < 1 || width > 2000)) || (height && (height < 1 || height > 2000))) {
    return res.status(400).send('Invalid image dimensions');
  }
  
  const origPath = path.join(__dirname, 'data/client-uploads', clientId, filename);
  if (!fs.existsSync(origPath)) return res.status(404).send('Image not found');

  if (width || height) {
    try {
      const cacheDir = path.join(__dirname, 'public/images/tmp', 'client', clientId);
      fs.mkdirSync(cacheDir, { recursive: true });
      const cacheName = `${path.parse(filename).name}_${width || ''}x${height || ''}${path.extname(filename)}`;
      const cachePath = path.join(cacheDir, cacheName);
      if (fs.existsSync(cachePath)) {
        return res.sendFile(cachePath);
      }
      let transformer = sharp(origPath);
      if (width || height) transformer = transformer.resize(width || null, height || null, { fit: 'inside' });
      await transformer.toFile(cachePath);
      return res.sendFile(cachePath);
    } catch (err) {
      logger.error('Error processing client image:', err);
      return res.status(500).send('Error processing image');
    }
  } else {
    return res.sendFile(origPath);
  }
});

// Parse URL-encoded bodies (for login form, etc.)
app.use(express.urlencoded({ extended: true }));

// Parse JSON bodies (for AJAX, API, etc.)
app.use(express.json());

// Log all requests
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl} - ${req.ip}`);
  next();
});

// Session middleware for login state
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // only over HTTPS in prod
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7 // 1 week
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
  // Skip cleanup in test environment to avoid interference
  if (process.env.NODE_ENV === 'test') return;
  
  const tmpDir = path.join(__dirname, 'public/images/tmp');
  const cutoff = Date.now() - 60 * 60 * 1000; // 1 hour ago
  
  fs.readdir(tmpDir, (err, files) => {
    if (err) {
      logger.error('Error reading tmp directory:', err);
      return;
    }
    
    files.forEach(file => {
      const filePath = path.join(tmpDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) {
          logger.error('Error checking file stats:', err);
          return;
        }
        
        if (stats.isFile() && stats.mtimeMs < cutoff) {
          fs.unlink(filePath, (err) => {
            if (err) {
              logger.error('Error deleting tmp file:', err);
            } else {
              logger.info('Cleaned up tmp file:', file);
            }
          });
        }
      });
    });
  });
}

// Run cleanup every hour
const cleanupInterval = setInterval(cleanTmpFolder, 60 * 60 * 1000);
cleanupInterval.unref(); // Prevents Jest from hanging due to open handles

// Run expired client cleanup every 6 hours (only in production/development)
if (process.env.NODE_ENV !== 'test') {
  const clientCleanupInterval = setInterval(async () => {
    try {
      const deleted = await cleanupExpiredClients();
      if (deleted > 0) {
        logger.info(`Cleaned up ${deleted} expired clients`);
      }
    } catch (err) {
      logger.error('Error cleaning up expired clients:', err);
    }
  }, 6 * 60 * 60 * 1000); // 6 hours
  clientCleanupInterval.unref();
}

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

// Centralized cache header middleware
function setCacheHeaders(res, filePath) {
  if (filePath.endsWith('service-worker.js')) {
    // Service worker should never be cached
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
  }
}

// Serve static files from /public with cache headers
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '30d',
  setHeaders: setCacheHeaders
}));

// Use client routes
app.use('/client', clientRoutes);

// Use admin routes
app.use('/admin', adminRoutes);

// Use main routes (homepage, gallery, manifest, 404)
app.use('/', mainRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(err.stack || err.toString());
  res.status(500);
  const isDev = process.env.NODE_ENV !== 'production';
  const errorMessage = err.message || err.toString();
  const errorStack = isDev ? (err.stack || '') : null;
  try {
    res.render('error', { error: errorMessage, stack: errorStack });
  } catch (e) {
    res.type('text').send('Server Error: ' + errorMessage + (isDev && errorStack ? '\n' + errorStack : ''));
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