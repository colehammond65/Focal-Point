// server.js
require('dotenv').config();

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is not set in your environment variables (.env file)');
}

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit'); // <-- ADDED

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
  getCategoryIdAndMaxPosition
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
setInterval(cleanTmpFolder, 60 * 60 * 1000);
// Also run at startup
cleanTmpFolder();

// Helper to get file type
async function getFileType(filePath) {
  const { fileTypeFromFile } = await import('file-type');
  return fileTypeFromFile(filePath);
}

// Homepage: Show all categories with previews
app.get('/', async (req, res) => {
  const categories = await getCachedCategories();
  res.render('index', { categories, images: null, category: null, loggedIn: req.session && req.session.loggedIn });
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

  res.render('index', { categories, category, images, loggedIn: req.session && req.session.loggedIn });
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

// Admin page: show upload form and category list (protected)
app.get('/admin', requireLogin, async (req, res) => {
  const categories = getCategoriesWithImages();
  res.render('admin', { categories, req });
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

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
