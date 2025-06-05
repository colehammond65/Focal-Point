// routes/main.js
// Main public routes for homepage, gallery, about, login, setup, and error handling.
const express = require('express');
const router = express.Router();
const generateDynamicCss = require('../utils/dynamicCss');
const notFoundPage = require('../views/partials/notfound');
const validator = require('validator');
const {
    getAllSettings,
    getSettingsWithDefaults,
    getOrderedImages,
    getCategoriesWithPreviews,
    verifyAdmin,
    createAdmin
} = require('../utils');
const rateLimit = require('express-rate-limit');

// Use shared helper for category cache
const { getCachedCategories } = require('../utils/categoryCache');

// Serve dynamic styles.css with accent color injection
router.get('/styles.css', async (req, res) => {
    const settings = await getSettingsWithDefaults();
    const accentColor = settings.accentColor || '#2ecc71';
    const css = await generateDynamicCss(accentColor);
    res.setHeader('Content-Type', 'text/css');
    res.send(css);
});

// Homepage: Show all categories with previews
router.get('/', async (req, res) => {
    const categories = await getCachedCategories();
    const settings = await getSettingsWithDefaults();
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
router.get('/gallery/:category', async (req, res) => {
    let category = req.params.category;
    category = validator.trim(category);
    if (!/^[\w-]+$/.test(category)) {
        return res.status(400).send('Invalid category');
    }
    const categories = await getCachedCategories();
    let images = [];
    try {
        images = await getOrderedImages(category);
    } catch (err) {
        console.error(err);
    }
    const settings = await getSettingsWithDefaults();
    res.render('index', {
        categories,
        category,
        images,
        loggedIn: req.session && req.session.loggedIn,
        settings,
        showAdminNav: req.session && req.session.loggedIn
    });
});

// Manifest route
router.get('/manifest.json', async (req, res) => {
    const settings = await getSettingsWithDefaults();
    let base = 'favicon-192.png';
    if (settings.favicon && settings.favicon.startsWith('favicon-')) {
        base = settings.favicon.replace(/-32\.png$/, '');
    } else {
        base = 'favicon';
    }
    res.setHeader('Content-Type', 'application/manifest+json');
    res.send(JSON.stringify({
        name: settings.siteTitle || "Focal Point ",
        short_name: (settings.siteTitle || "Gallery").slice(0, 12),
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#22223b",
        description: "A simple Focal Point .",
        icons: [
            {
                src: `/branding/${base}-192.png`,
                sizes: "192x192",
                type: "image/png"
            },
            {
                src: `/branding/${base}-512.png`,
                sizes: "512x512",
                type: "image/png"
            }
        ]
    }));
});

// Public About page
router.get('/about', async (req, res) => {
    const { db, ready } = require('../db');
    const marked = require('marked');
    const settings = await getSettingsWithDefaults();
    await ready;
    const about = db.prepare('SELECT * FROM about LIMIT 1').get();
    let aboutHtml = about && about.markdown ? marked.parse(about.markdown) : '';
    let image = about && about.image_path ? about.image_path : null;
    // No additional processing for the image is required here.
    res.render('about', {
        aboutHtml,
        image,
        req,
        settings,
        showAdminNav: false,
        loggedIn: req.session && req.session.loggedIn
    });
});

// --- AUTH & SETUP ROUTES (for root /login, /logout, /setup) --- //
const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again after 15 minutes.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Login page (GET)
router.get('/login', async (req, res) => {
    const settings = await getSettingsWithDefaults();
    res.render('login', { error: null, settings, showAdminNav: req.session && req.session.loggedIn });
});

// Handle login form (POST) -- RATE LIMITED
router.post('/login', adminLimiter, async (req, res) => {
    const { username, password } = req.body;
    const admin = await verifyAdmin(username, password);
    if (admin) {
        req.session.loggedIn = true;
        req.session.adminId = admin.id;
        return res.redirect('/admin/manage');
    } else {
        const settings = getSettingsWithDefaults();
        return res.render('login', { error: String('Invalid credentials'), settings, showAdminNav: false, loggedIn: false });
    }
});

// Logout: destroy session and redirect to login
router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// Setup page (GET)
router.get('/setup', async (req, res) => {
    const { adminExists } = require('../utils');
    if (await adminExists()) {
        return res.redirect('/login');
    }
    res.render('setup', { error: null, showAdminNav: req.session && req.session.loggedIn });
});

// Setup page (POST)
router.post('/setup', async (req, res) => {
    const { adminExists } = require('../utils');
    if (await adminExists()) {
        return res.redirect('/admin/login');
    }
    const { username, password } = req.body;
    if (!username || !password || username.length < 3 || password.length < 8) {
        // Redirect with error in query for toast
        return res.redirect('/setup?msg=' + encodeURIComponent('Username and password are required. Username must be at least 3 characters and password at least 8 characters.'));
    }
    await createAdmin(username, password);
    res.redirect('/admin/login');
});

// 404 handler (should be last)
router.use((req, res) => {
    const settings = getSettingsWithDefaults();
    res.status(404).send(notFoundPage(settings.siteTitle || "Focal Point ", req.session && req.session.loggedIn));
});

module.exports = router;
