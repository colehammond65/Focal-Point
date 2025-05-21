// server.js
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid');
const app = express();
const PORT = 3000;

// Set up EJS templating engine and views directory
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static images from /public/images at /images URL
app.use('/images', express.static(path.join(__dirname, 'public/images')));
// Parse URL-encoded bodies (for login form, etc.)
app.use(express.urlencoded({ extended: true }));

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

// Helper: Get all categories (folders) and a preview image for each
function getCategoriesWithPreviews() {
  const basePath = path.join(__dirname, 'public/images');
  if (!fs.existsSync(basePath)) return [];

  return fs.readdirSync(basePath)
    .filter(dir => {
      const fullPath = path.join(basePath, dir);
      // Exclude 'tmp' and any non-directory
      return dir !== 'tmp' && fs.statSync(fullPath).isDirectory();
    })
    .map(cat => {
      const catPath = path.join(basePath, cat);
      const images = fs.readdirSync(catPath).filter(f => /\.(jpg|jpeg|png|gif)$/i.test(f));
      return {
        name: cat,
        preview: images[0] || null,
      };
    });
}

// Helper: Validate category name
function isSafeCategory(category) {
  return typeof category === 'string' && /^[\w-]+$/.test(category);
}

// Homepage: Show all categories with previews
app.get('/', (req, res) => {
  const categories = getCategoriesWithPreviews();
  res.render('index', { categories, images: null, category: null, loggedIn: req.session && req.session.loggedIn });
});

// Gallery page: Show all images in a category
app.get('/gallery/:category', (req, res) => {
  const category = req.params.category;
  const basePath = path.join(__dirname, 'public/images');
  const categories = getCategoriesWithPreviews();

  let images = [];
  try {
    const categoryPath = path.join(basePath, category);
    images = fs.readdirSync(categoryPath).filter(f => /\.(jpg|jpeg|png|gif)$/i.test(f));
  } catch (err) {
    console.error(err);
  }

  res.render('index', { categories, category, images, loggedIn: req.session && req.session.loggedIn });
});

// Login page (GET)
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// Handle login form (POST)
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  // Check credentials from environment variables
  if (
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
    req.session.loggedIn = true;
    res.redirect('/admin');
  } else {
    res.render('login', { error: 'Invalid credentials' });
  }
});

// Logout: destroy session and redirect to login
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// Admin page: show upload form and category list (protected)
app.get('/admin', requireLogin, (req, res) => {
  const categories = fs.readdirSync(path.join(__dirname, 'public/images')).filter(dir => {
    const fullPath = path.join(__dirname, 'public/images', dir);
    // Exclude 'tmp' and any non-directory, and only allow safe names
    return dir !== 'tmp' && fs.statSync(fullPath).isDirectory() && isSafeCategory(dir);
  });
  res.render('admin', { categories });
});

// Handle image upload (multiple files, protected)
app.post('/upload', requireLogin, upload.array('images', 20), (req, res) => {
  const category = req.body.category;
  if (!isSafeCategory(category)) {
    return res.status(400).send('Invalid category');
  }
  const destDir = path.join(__dirname, 'public/images', category);
  fs.mkdirSync(destDir, { recursive: true });

  // Move each uploaded file from tmp to the category folder
  req.files.forEach(file => {
    const tmpPath = file.path;
    const destPath = path.join(destDir, file.filename);
    fs.renameSync(tmpPath, destPath);
  });

  res.redirect('/admin');
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
