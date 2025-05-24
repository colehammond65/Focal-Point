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

// Homepage: Show all categories with previews
app.get('/', async (req, res) => {
  const categories = await getCachedCategories();
  const settings = getAllSettings();
  res.render('index', {
    categories,
    images: null,
    category: null,
    loggedIn: req.session && req.session.loggedIn,
    settings,
    showAdminNav: req.session && req.session.loggedIn
  });
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
  res.render('index', {
    categories,
    category,
    images,
    loggedIn: req.session && req.session.loggedIn,
    settings,
    showAdminNav: req.session && req.session.loggedIn
  });
});

// Login page (GET)
app.get('/login', (req, res) => {
  const settings = getAllSettings();
  res.render('login', { error: null, settings, showAdminNav: req.session && req.session.loggedIn });
});

// Handle login form (POST) -- RATE LIMITED
app.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  const admin = await verifyAdmin(username, password);
  if (admin) {
    req.session.loggedIn = true;
    req.session.adminId = admin.id;
    return res.redirect('/admin');
  } else {
    const settings = getAllSettings();
    return res.render('login', { error: 'Invalid credentials', settings });
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
  res.render('setup', { error: null, showAdminNav: req.session && req.session.loggedIn });
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
  const serverBackups = backupUtils.listBackups();
  res.render('admin-settings', {
    req,
    settings,
    serverBackups,
    backupLimit: backupUtils.BACKUP_LIMIT_BYTES,
    showAdminNav: req.session && req.session.loggedIn,
    loggedIn: req.session && req.session.loggedIn
  });
});

// Image & Category Management page
app.get('/admin/manage', requireLogin, (req, res) => {
  const categories = getCategoriesWithImages();
  const settings = getAllSettings();
  res.render('admin-manage', {
    categories,
    req,
    settings,
    showAdminNav: req.session && req.session.loggedIn,
    loggedIn: req.session && req.session.loggedIn
  });
});

// Redirect /admin to /admin/manage for backward compatibility
app.get('/admin', requireLogin, (req, res) => {
  res.redirect('/admin/manage');
});

// List all admins
app.get('/admin/users', requireLogin, (req, res) => {
  const admins = db.prepare('SELECT id, username FROM admin').all();
  const currentAdmin = req.session.adminId;
  const settings = getAllSettings();
  res.render('admin-users', {
    admins,
    currentAdmin,
    req,
    settings,
    showAdminNav: req.session && req.session.loggedIn,
    loggedIn: req.session && req.session.loggedIn
  });
});

// Create new admin
app.post('/admin/users/create', requireLogin, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || username.length < 3 || password.length < 4) {
    return res.redirect('/admin/users?msg=Username and password required (min 3/4 chars)');
  }
  try {
    db.prepare('INSERT INTO admin (username, hash) VALUES (?, ?)').run(
      username,
      await bcrypt.hash(password, 10)
    );
    res.redirect('/admin/users?msg=Admin account created!');
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.redirect('/admin/users?msg=Username already taken');
    }
    res.redirect('/admin/users?msg=Failed to create admin');
  }
});

// Change own credentials
app.post('/admin/users/change-credentials', requireLogin, async (req, res) => {
  const { newUsername, currentPassword, newPassword } = req.body;
  if (!newUsername || !currentPassword || !newPassword) {
    return res.redirect('/admin/users?msg=All fields are required');
  }
  if (newUsername.length < 3 || newPassword.length < 4) {
    return res.redirect('/admin/users?msg=Username or password too short');
  }
  const admin = db.prepare('SELECT * FROM admin WHERE id = ?').get(req.session.adminId);
  if (!(await bcrypt.compare(currentPassword, admin.hash))) {
    return res.redirect('/admin/users?msg=Current password incorrect');
  }
  try {
    db.prepare('UPDATE admin SET username = ?, hash = ? WHERE id = ?')
      .run(newUsername, await bcrypt.hash(newPassword, 10), admin.id);
    req.session.destroy(() => {
      res.redirect('/login?msg=Credentials updated. Please log in again.');
    });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.redirect('/admin/users?msg=Username already taken');
    }
    res.redirect('/admin/users?msg=Failed to update credentials');
  }
});

// Change own username
app.post('/admin/users/change-username', requireLogin, async (req, res) => {
  const { newUsername, currentPassword } = req.body;
  if (!newUsername || !currentPassword) {
    return res.redirect('/admin/users?msg=All fields are required');
  }
  if (newUsername.length < 3) {
    return res.redirect('/admin/users?msg=Username too short');
  }
  const admin = db.prepare('SELECT * FROM admin WHERE id = ?').get(req.session.adminId);
  if (!(await bcrypt.compare(currentPassword, admin.hash))) {
    return res.redirect('/admin/users?msg=Current password incorrect');
  }
  try {
    db.prepare('UPDATE admin SET username = ? WHERE id = ?')
      .run(newUsername, admin.id);
    req.session.destroy(() => {
      res.redirect('/login?msg=Username updated. Please log in again.');
    });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.redirect('/admin/users?msg=Username already taken');
    }
    res.redirect('/admin/users?msg=Failed to update username');
  }
});

// Change own password
app.post('/admin/users/change-password', requireLogin, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.redirect('/admin/users?msg=All fields are required');
  }
  if (newPassword.length < 4) {
    return res.redirect('/admin/users?msg=Password too short');
  }
  const admin = db.prepare('SELECT * FROM admin WHERE id = ?').get(req.session.adminId);
  if (!(await bcrypt.compare(currentPassword, admin.hash))) {
    return res.redirect('/admin/users?msg=Current password incorrect');
  }
  try {
    db.prepare('UPDATE admin SET hash = ? WHERE id = ?')
      .run(await bcrypt.hash(newPassword, 10), admin.id);
    req.session.destroy(() => {
      res.redirect('/login?msg=Password updated. Please log in again.');
    });
  } catch (e) {
    res.redirect('/admin/users?msg=Failed to update password');
  }
});

// Optional: Delete another admin (prevent deleting self)
app.post('/admin/users/delete', requireLogin, (req, res) => {
  const { id } = req.body;
  if (!id || Number(id) === req.session.adminId) {
    return res.redirect('/admin/users?msg=Cannot delete your own account');
  }
  db.prepare('DELETE FROM admin WHERE id = ?').run(id);
  res.redirect('/admin/users?msg=Admin deleted');
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
app.post('/admin/settings', requireLogin, settingsUpload.fields([
  { name: 'favicon', maxCount: 1 },
  { name: 'headerImage', maxCount: 1 }
]), async (req, res) => {
  setSetting('siteTitle', req.body.siteTitle || "Photo Gallery");
  setSetting('headerType', req.body.headerType === 'image' ? 'image' : 'text');
  setSetting('headerTitle', req.body.headerTitle || "Photo Gallery");

  // Handle header image upload
  if (req.files && req.files.headerImage && req.files.headerImage[0]) {
    const inputPath = req.files.headerImage[0].path;
    const outputFilename = `header-${Date.now()}-${req.files.headerImage[0].originalname}`;
    const outputPath = path.join(uploadsDir, outputFilename);

    // Optionally resize or process image here
    fs.renameSync(inputPath, outputPath);
    setSetting('headerImage', outputFilename);

    // Optionally: remove old header images if you want to keep only the latest
  }

  // Handle favicon upload (existing logic)
  if (req.files && req.files.favicon && req.files.favicon[0]) {
    const inputPath = req.files.favicon[0].path;
    const outputFilename = `favicon-${Date.now()}.png`;
    const outputPath = path.join(uploadsDir, outputFilename);

    await sharp(inputPath)
      .resize(32, 32)
      .png()
      .toFile(outputPath);

    fs.unlinkSync(inputPath);
    setSetting('favicon', outputFilename);
  }

  res.redirect('/admin/settings?msg=Settings updated!');
});

app.post('/admin/settings/remove-header-image', requireLogin, (req, res) => {
  // Always clear the setting
  const settings = getAllSettings();
  const headerImage = settings.headerImage;
  console.log('Removing header image:', headerImage);
  setSetting('headerImage', '');

  // Try to delete the file if it exists
  if (headerImage) {
    const imgPath = path.join(uploadsDir, headerImage);
    if (fs.existsSync(imgPath)) {
      try {
        fs.unlinkSync(imgPath);
      } catch (e) {
        // Log but don't block
        console.error('Failed to delete header image:', e);
      }
    }
  }

  res.redirect('/admin/settings?msg=Header image removed');
});

// Delete image route (protected) -- RATE LIMITED
app.post('/delete-image', requireLogin, adminLimiter, async (req, res) => {
  const { category, filename } = req.body;
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return res.status(400).send('Invalid filename');
  }
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

// Rename category -- RATE LIMITED
app.post('/rename-category', requireLogin, adminLimiter, async (req, res) => {
  const { oldName, newName } = req.body;
  if (!isSafeCategory(oldName) || !isSafeCategory(newName)) {
    return res.redirect('/admin?msg=Invalid category name!');
  }
  if (!categoryExists(oldName)) {
    return res.redirect('/admin?msg=Original category not found!');
  }
  if (categoryExists(newName)) {
    return res.redirect('/admin?msg=Category name already exists!');
  }
  // Update category name in DB
  db.prepare('UPDATE categories SET name = ? WHERE name = ?').run(newName, oldName);
  // Rename folder on disk if exists
  const oldDir = path.join(__dirname, 'public/images', oldName);
  const newDir = path.join(__dirname, 'public/images', newName);
  if (fs.existsSync(oldDir)) {
    fs.renameSync(oldDir, newDir);
  }
  invalidateCategoryCache();
  return res.redirect('/admin?msg=Category renamed!');
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

// Change admin credentials (protected)
app.post('/admin/change-credentials', requireLogin, async (req, res) => {
  const { newUsername, currentPassword, newPassword } = req.body;
  if (!newUsername || !currentPassword || !newPassword) {
    return res.redirect('/admin/settings?msg=All fields are required');
  }
  if (newUsername.length < 3 || newPassword.length < 4) {
    return res.redirect('/admin/settings?msg=Username or password too short');
  }
  const settings = getAllSettings();
  const admin = getAdmin();
  // Verify current password
  if (!(await verifyAdmin(admin.username, currentPassword))) {
    return res.redirect('/admin/settings?msg=Current password incorrect');
  }
  // Update admin credentials
  try {
    db.prepare('UPDATE admin SET username = ?, hash = ? WHERE id = ?')
      .run(newUsername, await require('bcryptjs').hash(newPassword, 10), admin.id);
    // Log out the session so the user must log in again
    req.session.destroy(() => {
      res.redirect('/login?msg=Credentials updated. Please log in again.');
    });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.redirect('/admin/settings?msg=Username already taken');
    }
    console.error(e);
    return res.redirect('/admin/settings?msg=Failed to update credentials');
  }
});

// Download backup (admin only)
app.get('/admin/backup', requireLogin, async (req, res) => {
  try {
    // Create an in-memory zip archive
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks = [];
    archive.on('data', chunk => chunks.push(chunk));
    archive.on('warning', err => { if (err.code !== 'ENOENT') throw err; });
    archive.on('error', err => { throw err; });

    // Add the SQLite database file
    const dbPath = path.join(__dirname, 'data', 'gallery.db');
    if (fs.existsSync(dbPath)) {
      archive.file(dbPath, { name: 'gallery.db' });
    }

    // Add the images directory
    const imagesDir = path.join(__dirname, 'public', 'images');
    if (fs.existsSync(imagesDir)) {
      archive.directory(imagesDir, 'images');
    }

    // Add the uploads directory
    const uploadsDir = path.join(__dirname, 'public', 'uploads');
    if (fs.existsSync(uploadsDir)) {
      archive.directory(uploadsDir, 'uploads');
    }

    // Wait for the archive to finish and get the buffer
    const backupBuffer = await new Promise((resolve, reject) => {
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);
      archive.finalize();
    });

    const backupFilename = `backup-${Date.now()}.zip`;
    backupUtils.saveBackup(backupBuffer, backupFilename);

    res.setHeader('Content-Disposition', `attachment; filename="${backupFilename}"`);
    res.setHeader('Content-Type', 'application/zip');
    res.send(backupBuffer);
  } catch (err) {
    console.error('Backup failed:', err);
    res.status(500).send('Backup failed');
  }
});

app.post('/admin/backup', requireLogin, async (req, res) => {
  try {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks = [];
    archive.on('data', chunk => chunks.push(chunk));
    archive.on('warning', err => { if (err.code !== 'ENOENT') throw err; });
    archive.on('error', err => { throw err; });

    // Add the SQLite database file
    const dbPath = path.join(__dirname, 'data', 'gallery.db');
    if (fs.existsSync(dbPath)) {
      archive.file(dbPath, { name: 'gallery.db' });
    }

    // Add the images directory
    const imagesDir = path.join(__dirname, 'public', 'images');
    if (fs.existsSync(imagesDir)) {
      archive.directory(imagesDir, 'images');
    }

    // Add the uploads directory
    const uploadsDir = path.join(__dirname, 'public', 'uploads');
    if (fs.existsSync(uploadsDir)) {
      archive.directory(uploadsDir, 'uploads');
    }

    // Wait for the archive to finish and get the buffer
    const backupBuffer = await new Promise((resolve, reject) => {
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);
      archive.finalize();
    });

    const backupFilename = `backup-${Date.now()}.zip`;
    backupUtils.saveBackup(backupBuffer, backupFilename);

    // Redirect back to settings with a message
    res.redirect('/admin/settings?msg=Backup created and saved on server!');
  } catch (err) {
    console.error('Backup failed:', err);
    res.redirect('/admin/settings?msg=Backup failed');
  }
});

app.get('/admin/backup/download/:filename', requireLogin, (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(backupUtils.BACKUP_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.download(filePath);
});

app.post('/admin/backup/delete/:filename', requireLogin, (req, res) => {
  const { filename } = req.params;
  // Prevent path traversal
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return res.redirect('/admin/settings?msg=Invalid filename');
  }
  const filePath = path.join(backupUtils.BACKUP_DIR, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return res.redirect('/admin/settings?msg=Backup deleted!');
  }
  return res.redirect('/admin/settings?msg=Backup not found');
});

app.post('/admin/backup/bulk-action', requireLogin, async (req, res) => {
  let backups = req.body.backups;
  if (!backups) return res.redirect('/admin/settings?msg=No backups selected');
  if (!Array.isArray(backups)) backups = [backups];

  if (req.body.action === 'delete') {
    let deleted = 0;
    for (const filename of backups) {
      if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) continue;
      const filePath = path.join(backupUtils.BACKUP_DIR, filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deleted++;
      }
    }
    return res.redirect(`/admin/settings?msg=Deleted ${deleted} backup(s)!`);
  } else if (req.body.action === 'download') {
    // Create a zip of selected backups
    const archiver = require('archiver');
    const archive = archiver('zip', { zlib: { level: 9 } });
    res.setHeader('Content-Disposition', `attachment; filename="selected-backups.zip"`);
    res.setHeader('Content-Type', 'application/zip');
    for (const filename of backups) {
      if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) continue;
      const filePath = path.join(backupUtils.BACKUP_DIR, filename);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: filename });
      }
    }
    archive.pipe(res);
    archive.finalize();
    return;
  }
  res.redirect('/admin/settings?msg=Unknown action');
});

// Restore backup (admin only)
const restoreUpload = multer({ dest: path.join(__dirname, 'public', 'uploads') });
app.post('/admin/restore', requireLogin, restoreUpload.single('backup'), async (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded');
  const zipPath = req.file.path;
  const extractDir = path.join(__dirname, 'public', 'uploads', 'restore-tmp-' + Date.now());
  let errorOccurred = false;
  try {
    // Extract zip to a temp dir
    fs.mkdirSync(extractDir, { recursive: true });
    await fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: extractDir }))
      .promise();

    // Validate gallery.db
    const dbSrc = path.join(extractDir, 'gallery.db');
    if (!fs.existsSync(dbSrc)) {
      throw new Error('Backup ZIP does not contain gallery.db');
    }
    try {
      const testDb = new Database(dbSrc, { readonly: true });
      const tables = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admin'").get();
      testDb.close();
      if (!tables) throw new Error('Missing required table(s)');
    } catch (err) {
      throw new Error('Invalid or corrupt backup database file.');
    }

    // Move/extract DB
    const dbDest = path.join(__dirname, 'data', 'gallery.db');
    fs.copyFileSync(dbSrc, dbDest);

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

    // Move/extract uploads
    const uploadsSrc = path.join(extractDir, 'uploads');
    const uploadsDest = path.join(__dirname, 'public', 'uploads');
    if (fs.existsSync(uploadsSrc)) {
      if (fs.existsSync(uploadsDest)) {
        fs.rmSync(uploadsDest, { recursive: true, force: true });
      }
      try {
        fs.renameSync(uploadsSrc, uploadsDest);
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
          copyDir(uploadsSrc, uploadsDest);
          fs.rmSync(uploadsSrc, { recursive: true, force: true });
        } else {
          throw err;
        }
      }
    }

    res.redirect('/admin/settings?msg=Backup restored!');
  } catch (err) {
    errorOccurred = true;
    console.error('Restore failed:', err);
    res.redirect('/admin/settings?msg=Restore failed: ' + encodeURIComponent(err.message));
  } finally {
    // Always cleanup temp files/folders
    try { if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath); } catch { }
    try { if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true }); } catch { }
  }
});

app.post('/admin/restore-selected', requireLogin, async (req, res) => {
  const filename = req.body.backup;
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return res.redirect('/admin/settings?msg=Invalid backup file');
  }
  const filePath = path.join(backupUtils.BACKUP_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.redirect('/admin/settings?msg=Backup file not found');
  }
  const unzipper = require('unzipper');
  const extractDir = path.join(__dirname, 'public', 'uploads', 'restore-tmp-' + Date.now());
  try {
    fs.mkdirSync(extractDir, { recursive: true });
    await fs.createReadStream(filePath)
      .pipe(unzipper.Extract({ path: extractDir }))
      .promise();

    // Validate gallery.db
    const dbSrc = path.join(extractDir, 'gallery.db');
    if (!fs.existsSync(dbSrc)) {
      throw new Error('Backup ZIP does not contain gallery.db');
    }
    try {
      const testDb = new Database(dbSrc, { readonly: true });
      const tables = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admin'").get();
      testDb.close();
      if (!tables) throw new Error('Missing required table(s)');
    } catch (err) {
      throw new Error('Invalid or corrupt backup database file.');
    }

    // Move/extract DB
    const dbDest = path.join(__dirname, 'data', 'gallery.db');
    fs.copyFileSync(dbSrc, dbDest);

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

    // Move/extract uploads
    const uploadsSrc = path.join(extractDir, 'uploads');
    const uploadsDest = path.join(__dirname, 'public', 'uploads');
    if (fs.existsSync(uploadsSrc)) {
      if (fs.existsSync(uploadsDest)) {
        fs.rmSync(uploadsDest, { recursive: true, force: true });
      }
      try {
        fs.renameSync(uploadsSrc, uploadsDest);
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
          copyDir(uploadsSrc, uploadsDest);
          fs.rmSync(uploadsSrc, { recursive: true, force: true });
        } else {
          throw err;
        }
      }
    }

    res.redirect('/admin/settings?msg=Backup restored!');
  } catch (err) {
    console.error('Restore failed:', err);
    res.redirect('/admin/settings?msg=Restore failed: ' + encodeURIComponent(err.message));
  } finally {
    try { if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true }); } catch { }
  }
});

const aboutUpload = multer({ dest: path.join(__dirname, 'public/uploads/') });
// Public About page
app.get('/about', (req, res) => {
  const about = db.prepare('SELECT * FROM about LIMIT 1').get();
  const aboutHtml = marked.parse(about?.markdown || '');
  const settings = getAllSettings();
  res.render('about', {
    aboutHtml,
    image: about?.image_path,
    settings,
    showAdminNav: req.session && req.session.loggedIn,
    loggedIn: req.session && req.session.loggedIn
  });
});

// Admin About editor (GET)
app.get('/admin/about', requireLogin, (req, res) => {
  const about = db.prepare('SELECT * FROM about LIMIT 1').get();
  const settings = getAllSettings();
  res.render('admin-about', {
    about,
    req,
    settings,
    showAdminNav: req.session && req.session.loggedIn,
    loggedIn: req.session && req.session.loggedIn
  });
});

// Admin About editor (POST)
app.post('/admin/about', requireLogin, aboutUpload.single('image'), (req, res) => {
  let imagePath = req.body.currentImage;
  if (req.file) {
    imagePath = '/uploads/' + req.file.filename;
  }
  db.prepare('UPDATE about SET markdown = ?, image_path = ? WHERE id = 1')
    .run(req.body.markdown, imagePath);
  res.redirect('/admin/about?msg=Saved!');
});

app.post('/admin/about/delete-image', requireLogin, (req, res) => {
  const about = db.prepare('SELECT * FROM about LIMIT 1').get();
  if (about && about.image_path) {
    const imgPath = path.join(__dirname, 'public', about.image_path.replace(/^\//, ''));
    if (fs.existsSync(imgPath)) {
      try { fs.unlinkSync(imgPath); } catch (e) { /* ignore */ }
    }
    db.prepare('UPDATE about SET image_path = NULL WHERE id = 1').run();
  }
  res.redirect('/admin/about?msg=Image deleted!');
});

// Place this after all other routes, but before error handling middleware
const notFoundPage = require('./views/partials/notfound'); // Import the 404 HTML generator

app.use((req, res) => {
  const settings = getAllSettings();
  res.status(404).send(notFoundPage(settings.siteTitle || "Photo Gallery", req.session && req.session.loggedIn));
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