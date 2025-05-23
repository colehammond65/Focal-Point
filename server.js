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
  getAllSettings,
  setSetting
} = require('./utils');
const app = express();
const PORT = 3000;

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

// Middleware to protect admin routes
function requireLogin(req, res, next) {
  if (req.session && req.session.loggedIn) {
    next();
  } else {
    res.redirect('/login');
  }
}

// Redirect to /setup if admin account doesn't exist and not already on /setup
app.use((req, res, next) => {
  if (
    !adminExists() &&
    req.path !== '/setup' &&
    req.path !== '/setup/' &&
    !req.path.startsWith('/public') &&
    !req.path.startsWith('/styles') &&
    !req.path.startsWith('/images')
  ) {
    return res.redirect('/setup');
  }
  next();
});

// Ensure the temporary upload directory exists
const tmpDir = path.join(__dirname, 'public/images/tmp');
fs.mkdirSync(tmpDir, { recursive: true });

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
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
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

// Homepage: Show all categories with previews
app.get('/', async (req, res) => {
  const categories = await getCachedCategories();
  const settings = getAllSettings();
  res.render('index', { categories, images: null, category: null, loggedIn: req.session && req.session.loggedIn, settings });
});

// Gallery page: Show all images in a category
app.get('/gallery/:category', async (req, res) => {
  const category = req.params.category;
  const categories = await getCachedCategories();

  let images = [];
  try {
    images = getOrderedImages(category);
  } catch (err) {
    console.error(err);
  }

  const settings = getAllSettings();
  res.render('index', { categories, category, images, loggedIn: req.session && req.session.loggedIn, settings });
});

// Login page (GET)
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// Handle login form (POST) -- RATE LIMITED
app.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (await verifyAdmin(username, password)) {
    req.session.loggedIn = true;
    return res.redirect('/admin');
  } else {
    return res.render('login', { error: 'Invalid credentials' });
  }
});

// Logout: destroy session and redirect to login
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// Setup page (GET)
app.get('/setup', (req, res) => {
  if (adminExists()) return res.redirect('/login');
  res.render('setup', { error: null });
});

// Setup page (POST)
app.post('/setup', async (req, res) => {
  if (adminExists()) return res.redirect('/login');
  const { username, password } = req.body;
  if (!username || !password || username.length < 3 || password.length < 4) {
    return res.render('setup', { error: 'Username and password are required (min 3/4 chars).' });
  }
  await createAdmin(username, password);
  res.redirect('/login');
});

// Site Settings page
app.get('/admin/settings', requireLogin, (req, res) => {
  const settings = getAllSettings();
  res.render('admin-settings', { req, settings });
});

// Image & Category Management page
app.get('/admin/manage', requireLogin, (req, res) => {
  const categories = getCategoriesWithImages();
  const settings = getAllSettings();
  res.render('admin-manage', { categories, req, settings });
});

// Redirect /admin to /admin/manage for backward compatibility
app.get('/admin', requireLogin, (req, res) => {
  res.redirect('/admin/manage');
});

// Handle image upload (multiple files, protected) -- RATE LIMITED
app.post('/upload', requireLogin, adminLimiter, upload.array('images', 20), async (req, res, next) => {
  try {
    const category = req.body.category;
    if (!isSafeCategory(category)) {
      return res.status(400).send('Invalid category');
    }
    const destDir = path.join(__dirname, 'public/images', category);
    fs.mkdirSync(destDir, { recursive: true });

    // Get category id and max position
    const catInfo = getCategoryIdAndMaxPosition(category);
    if (!catInfo) return res.status(400).send('Category not found');
    let maxPos = catInfo.maxPos;

    for (const file of req.files) {
      const tmpPath = file.path;
      const fileType = await getFileType(tmpPath);
      if (!fileType || !fileType.mime.startsWith('image/')) {
        fs.unlinkSync(tmpPath);
        continue; // skip invalid files
      }
      const destPath = path.join(destDir, file.filename);
      fs.renameSync(tmpPath, destPath);

      // Add to DB
      addImage(category, file.filename, ++maxPos, '');
    }

    invalidateCategoryCache();
    return res.redirect('/admin?msg=Upload successful!');
  } catch (err) {
    next(err);
  }
});

// Update settings (protected)
app.post('/admin/settings', requireLogin, settingsUpload.single('favicon'), async (req, res) => {
  setSetting('siteTitle', req.body.siteTitle || "Anne's Photography");
  setSetting('headerTitle', req.body.headerTitle || "Anne's Photography");

  if (req.file) {
    // Convert and resize favicon to 32x32 PNG
    const inputPath = req.file.path;
    const outputFilename = `favicon-${Date.now()}.png`;
    const outputPath = path.join(uploadsDir, outputFilename);

    try {
      await sharp(inputPath)
        .resize(32, 32)
        .png()
        .toFile(outputPath);

      fs.unlinkSync(inputPath); // Remove the original upload

      setSetting('favicon', outputFilename);

      // Optionally: remove old favicon files if you want to keep only the latest
      // (You can implement cleanup logic here if desired)
    } catch (err) {
      console.error('Favicon processing failed:', err);
      // Optionally set a flash message or error
    }
  }

  res.redirect('/admin?msg=Settings updated!');
});

// Delete image route (protected) -- RATE LIMITED
app.post('/delete-image', requireLogin, adminLimiter, async (req, res) => {
  const { category, filename } = req.body;
  if (!isSafeCategory(category) || !filename || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Invalid request' });
  }
  // Remove file from filesystem
  const filePath = path.join(__dirname, 'public/images', category, filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  deleteImage(category, filename);
  invalidateCategoryCache();
  return res.sendStatus(200);
});

// Bulk delete images route (protected) -- RATE LIMITED
app.post('/bulk-delete-images', requireLogin, adminLimiter, async (req, res) => {
  const { category, filenames } = req.body;
  if (!isSafeCategory(category) || !Array.isArray(filenames)) {
    return res.status(400).json({ error: 'Invalid request' });
  }
  for (const filename of filenames) {
    const filePath = path.join(__dirname, 'public/images', category, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    deleteImage(category, filename);
  }
  invalidateCategoryCache();
  return res.json({ deleted: filenames });
});

// Create category -- RATE LIMITED
app.post('/create-category', requireLogin, adminLimiter, async (req, res) => {
  let newCategory = req.body.newCategory || '';
  newCategory = newCategory
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!isSafeCategory(newCategory) || !newCategory) {
    return res.redirect('/admin?msg=Invalid category name!');
  }
  if (!categoryExists(newCategory)) {
    createCategory(newCategory);
    invalidateCategoryCache();
  }
  return res.redirect('/admin?msg=Category created!');
});

// Delete category -- RATE LIMITED
app.post('/delete-category', requireLogin, adminLimiter, async (req, res) => {
  const category = req.body.category;
  if (!isSafeCategory(category)) return res.redirect('/admin?msg=Invalid category!');
  if (categoryExists(category)) {
    deleteCategory(category);
    // Remove folder from filesystem
    const catDir = path.join(__dirname, 'public/images', category);
    if (fs.existsSync(catDir)) fs.rmSync(catDir, { recursive: true, force: true });
    invalidateCategoryCache();
    return res.redirect('/admin?msg=Category deleted!');
  } else {
    return res.redirect('/admin?msg=Category not found!');
  }
});

// Reorder images -- RATE LIMITED
app.post('/reorder-images', requireLogin, adminLimiter, async (req, res) => {
  const { category, order } = req.body;
  if (!isSafeCategory(category)) return res.redirect('/admin?msg=Invalid category!');
  let orderArr;
  try {
    orderArr = JSON.parse(order);
    if (!Array.isArray(orderArr)) throw new Error();
  } catch {
    return res.redirect('/admin?msg=Invalid order data!');
  }
  saveImageOrder(category, orderArr);
  invalidateCategoryCache();
  return res.redirect('/admin?msg=Order saved!');
});

// Reorder categories -- RATE LIMITED
app.post('/reorder-categories', requireLogin, adminLimiter, async (req, res) => {
  const { order } = req.body; // order is an array of category names
  if (!Array.isArray(order)) return res.status(400).json({ error: 'Invalid order' });
  order.forEach((catName, idx) => {
    db.prepare('UPDATE categories SET position = ? WHERE name = ?').run(idx, catName);
  });
  invalidateCategoryCache();
  res.json({ success: true });
});

// Set category thumbnail -- RATE LIMITED
app.post('/set-thumbnail', requireLogin, adminLimiter, async (req, res) => {
  const { category, filename } = req.body;
  if (!isSafeCategory(category) || !filename || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Invalid request' });
  }
  const filePath = path.join(__dirname, 'public/images', category, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(400).json({ error: 'Image not found' });
  }
  setCategoryThumbnail(category, filename);
  invalidateCategoryCache();
  return res.json({ success: true });
});

// Update alt text for an image -- RATE LIMITED
app.post('/update-alt-text', requireLogin, adminLimiter, (req, res) => {
  const { imageId, altText } = req.body;
  if (!imageId) return res.status(400).json({ error: 'Missing image ID' });
  updateAltText(imageId, altText);
  res.json({ success: true });
});

// Move image to another category -- RATE LIMITED
app.post('/move-image', requireLogin, adminLimiter, async (req, res) => {
  const { filenames, fromCategory, toCategory } = req.body;
  if (
    !isSafeCategory(fromCategory) ||
    !isSafeCategory(toCategory) ||
    !Array.isArray(filenames) ||
    filenames.some(f => !f || f.includes('/') || f.includes('\\'))
  ) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  if (!categoryExists(toCategory)) {
    return res.status(400).json({ error: 'Destination category does not exist' });
  }

  const destDir = path.join(__dirname, 'public/images', toCategory);
  fs.mkdirSync(destDir, { recursive: true });

  let moved = 0;
  for (const filename of filenames) {
    const srcPath = path.join(__dirname, 'public/images', fromCategory, filename);
    const destPath = path.join(destDir, filename);
    if (!fs.existsSync(srcPath)) continue;
    fs.renameSync(srcPath, destPath);
    deleteImage(fromCategory, filename);
    const { maxPos } = require('./utils').getCategoryIdAndMaxPosition(toCategory);
    addImage(toCategory, filename, maxPos + 1, '');
    moved++;
  }

  invalidateCategoryCache();
  return res.json({ success: true, moved });
});

// Download backup (admin only)
app.get('/admin/backup', requireLogin, (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="gallery-backup.zip"');
  res.setHeader('Content-Type', 'application/zip');
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);
  archive.file(path.join(__dirname, 'data', 'gallery.db'), { name: 'gallery.db' });
  archive.directory(path.join(__dirname, 'public', 'images'), 'images');
  archive.finalize();
});

// Restore backup (admin only)
const restoreUpload = multer({ dest: path.join(__dirname, 'public', 'uploads') });
app.post('/admin/restore', requireLogin, restoreUpload.single('backup'), async (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded');
  const zipPath = req.file.path;
  try {
    // Extract zip to a temp dir
    const extractDir = path.join(__dirname, 'public', 'uploads', 'restore-tmp-' + Date.now());
    fs.mkdirSync(extractDir, { recursive: true });
    await fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: extractDir }))
      .promise();

    // Move/extract DB
    const dbSrc = path.join(extractDir, 'gallery.db');
    const dbDest = path.join(__dirname, 'data', 'gallery.db');
    if (fs.existsSync(dbSrc)) {
      fs.copyFileSync(dbSrc, dbDest);
    }

    // Move/extract images
    const imagesSrc = path.join(extractDir, 'images');
    const imagesDest = path.join(__dirname, 'public', 'images');
    if (fs.existsSync(imagesSrc)) {
      if (fs.existsSync(imagesDest)) {
        fs.rmSync(imagesDest, { recursive: true, force: true });
      }
      try {
        fs.renameSync(imagesSrc, imagesDest);
      } catch (err) {
        if (err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'ENOTEMPTY') {
          // Fallback: copy files manually
          const copyDir = (src, dest) => {
            fs.mkdirSync(dest, { recursive: true });
            for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
              const srcPath = path.join(src, entry.name);
              const destPath = path.join(dest, entry.name);
              if (entry.isDirectory()) {
                copyDir(srcPath, destPath);
              } else {
                fs.copyFileSync(srcPath, destPath);
              }
            }
          };
          copyDir(imagesSrc, imagesDest);
          fs.rmSync(imagesSrc, { recursive: true, force: true });
        } else {
          throw err;
        }
      }
    }

    // Cleanup
    fs.unlinkSync(zipPath);
    fs.rmSync(extractDir, { recursive: true, force: true });

    res.redirect('/admin/settings?msg=Backup restored!');
  } catch (err) {
    console.error('Restore failed:', err);
    res.status(500).send('Restore failed: ' + err.message);
  }
});

// Place this after all other routes, but before error handling middleware
const notFoundPage = require('./views/partials/notfound'); // Import the 404 HTML generator

app.use((req, res) => {
  res.status(404).send(notFoundPage());
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);

  // If AJAX or JSON request, send JSON error
  if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  } else {
    // Otherwise, render a friendly error page or message
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
