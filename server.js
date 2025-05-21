// server.js
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const app = express();
const PORT = 3000;

// Set up EJS templating
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware for static files
app.use('/images', express.static(path.join(__dirname, 'public/images')));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'your-secret-key', // Change this to a strong secret in production!
  resave: false,
  saveUninitialized: false
}));

// Simple authentication middleware
function requireLogin(req, res, next) {
  if (req.session && req.session.loggedIn) {
    next();
  } else {
    res.redirect('/login');
  }
}

// Ensure temporary directory exists
const tmpDir = path.join(__dirname, 'public/images/tmp');
fs.mkdirSync(tmpDir, { recursive: true });

// Configure Multer for uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Multer does NOT parse req.body before this callback!
    // Use req.body.category only if you use a custom field parser before multer.
    // Instead, use a query param or a custom field in the filename, or use memoryStorage and move the file after.
    cb(null, path.join(__dirname, 'public/images/tmp'));
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage });

// Get categories with their preview images
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

// Homepage: list categories with previews
app.get('/', (req, res) => {
  const categories = getCategoriesWithPreviews();
  res.render('index', { categories, images: null, category: null, loggedIn: req.session && req.session.loggedIn });
});

// Gallery page: show images in selected category
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

// Login page
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// Handle login form
app.post('/login', (req, res) => {
  const { username, password } = req.body;
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

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// Admin page
app.get('/admin', requireLogin, (req, res) => {
  const categories = fs.readdirSync(path.join(__dirname, 'public/images')).filter(dir => {
    const fullPath = path.join(__dirname, 'public/images', dir);
    // Exclude 'tmp' and any non-directory
    return dir !== 'tmp' && fs.statSync(fullPath).isDirectory();
  });
  res.render('admin', { categories });
});

// Handle image upload
app.post('/upload', upload.single('image'), (req, res) => {
  const category = req.body.category;
  if (!category) {
    return res.status(400).send('No category provided');
  }
  const tmpPath = req.file.path;
  const destDir = path.join(__dirname, 'public/images', category);
  fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(destDir, req.file.filename);
  fs.renameSync(tmpPath, destPath);
  res.redirect('/admin');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
