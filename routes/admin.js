const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const unzipper = require('unzipper');
const sharp = require('sharp');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const backupUtils = require('../utils/backup');
const db = require('../db');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const {
    getCategoriesWithImages,
    adminExists,
    createAdmin,
    getAdmin,
    verifyAdmin,
    getAllSettings,
    setSetting,
    getSetting,
    updateAltText,
    setCategoryThumbnail,
    saveImageOrder,
    getCategoryIdAndMaxPosition,
    isSafeCategory,
    categoryExists,
    createCategory,
    deleteCategory,
    deleteImage,
    addImage
} = require('../utils');
const {
    getAllClients,
    getClientById,
    getClientImages,
    addClientImage,
    deleteClientImage,
    deleteClient,
    toggleClientStatus,
    incrementDownloadCount,
    createZipArchive,
    CLIENT_UPLOADS_DIR,
    createClient // <-- ensure this is included
} = require('../utils/clients');

// Middleware to protect admin routes (moved from server.js)
function requireLogin(req, res, next) {
    if (req.session && req.session.loggedIn) {
        next();
    } else {
        res.redirect('/login');
    }
}

// Redirect to /setup if admin account doesn't exist and not already on /setup (moved from server.js)
function adminSetupRedirect(req, res, next) {
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
}

// Apply adminSetupRedirect to all admin routes
router.use(adminSetupRedirect);

const rateLimit = require('express-rate-limit');
const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again after 15 minutes.',
    standardHeaders: true,
    legacyHeaders: false,
});
const uploadsDir = path.join(__dirname, '../public/uploads');

// Helper to always provide settings with defaults
function getSettingsWithDefaults() {
    let settings = getAllSettings() || {};
    settings.siteTitle = settings.siteTitle || 'Focal Point';
    settings.headerTitle = settings.headerTitle || 'Focal Point';
    settings.favicon = typeof settings.favicon === 'string' ? settings.favicon : '';
    settings.accentColor = settings.accentColor || '#2ecc71';
    settings.headerType = settings.headerType || 'text';
    settings.headerImage = typeof settings.headerImage === 'string' ? settings.headerImage : '';
    return settings;
}

// --- AUTH & SETUP ROUTES (moved from server.js) --- //

// Login page (GET)
router.get('/login', (req, res) => {
    const settings = getSettingsWithDefaults();
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
        return res.render('login', { error: 'Invalid credentials', settings });
    }
});

// Logout: destroy session and redirect to login
router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// Setup page (GET)
router.get('/setup', (req, res) => {
    res.render('setup', { error: null, showAdminNav: req.session && req.session.loggedIn });
});

// Setup page (POST)
router.post('/setup', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password || username.length < 3 || password.length < 4) {
        return res.render('setup', { error: 'Username and password are required (min 3/4 chars).' });
    }
    await createAdmin(username, password);
    res.redirect('/admin/login');
});

// --- ADMIN ROUTES --- //

// Settings page
router.get('/settings', requireLogin, (req, res) => {
    const settings = getSettingsWithDefaults();
    const serverBackups = backupUtils.listBackups();
    const backupLimit = backupUtils.BACKUP_LIMIT_BYTES;
    res.render('admin-settings', {
        req,
        settings,
        serverBackups,
        backupLimit,
        showAdminNav: req.session && req.session.loggedIn,
        loggedIn: req.session && req.session.loggedIn
    });
});

// Settings update (protected) with file upload support
const settingsStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../public/uploads'));
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        cb(null, uuidv4() + ext);
    }
});
const settingsUpload = multer({
    storage: settingsStorage,
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
    },
    limits: { fileSize: 5 * 1024 * 1024 }
});

router.post('/settings', requireLogin, settingsUpload.fields([
    { name: 'favicon', maxCount: 1 },
    { name: 'headerImage', maxCount: 1 }
]), (req, res) => {
    setSetting('siteTitle', (typeof req.body.siteTitle === 'string' && req.body.siteTitle.trim()) ? req.body.siteTitle.trim() : 'Focal Point');
    let headerType = 'text';
    if (typeof req.body.headerType === 'string') {
        headerType = req.body.headerType === 'image' ? 'image' : 'text';
    } else if (typeof req.body.headerTypeHidden === 'string') {
        headerType = req.body.headerTypeHidden === 'image' ? 'image' : 'text';
    }
    setSetting('headerType', headerType);
    setSetting('headerTitle', (typeof req.body.headerTitle === 'string' && req.body.headerTitle.trim()) ? req.body.headerTitle.trim() : 'Focal Point');
    setSetting('accentColor', (typeof req.body.accentColor === 'string' && req.body.accentColor.trim()) ? req.body.accentColor.trim() : '#2ecc71');

    // Handle file uploads
    if (req.files && req.files.favicon && req.files.favicon[0]) {
        setSetting('favicon', req.files.favicon[0].filename);
    } else if (typeof req.body.favicon === 'string') {
        setSetting('favicon', req.body.favicon);
    } else {
        setSetting('favicon', '');
    }
    if (req.files && req.files.headerImage && req.files.headerImage[0]) {
        setSetting('headerImage', req.files.headerImage[0].filename);
    } else if (typeof req.body.headerImage === 'string') {
        setSetting('headerImage', req.body.headerImage);
    } else {
        setSetting('headerImage', '');
    }

    // Ensure all settings keys are present after update
    const settings = getAllSettings() || {};
    if (!('siteTitle' in settings)) setSetting('siteTitle', 'Focal Point');
    if (!('headerTitle' in settings)) setSetting('headerTitle', 'Focal Point');
    if (!('favicon' in settings)) setSetting('favicon', '');
    if (!('accentColor' in settings)) setSetting('accentColor', '#2ecc71');
    if (!('headerType' in settings)) setSetting('headerType', 'text');
    if (!('headerImage' in settings)) setSetting('headerImage', '');
    res.redirect('/admin/settings?msg=Settings updated!');
});

// Remove header image
router.post('/settings/remove-header-image', requireLogin, (req, res) => {
    setSetting('headerImage', '');
    res.redirect('/admin/settings?msg=Header image removed');
});

// Image & Category Management page
router.get('/manage', requireLogin, (req, res) => {
    const categories = getCategoriesWithImages();
    const settings = getSettingsWithDefaults();
    res.render('admin-manage', {
        categories,
        req,
        settings,
        showAdminNav: req.session && req.session.loggedIn,
        loggedIn: req.session && req.session.loggedIn
    });
});

// List all admins
router.get('/users', requireLogin, (req, res) => {
    const admins = db.prepare('SELECT id, username FROM admin').all();
    const currentAdmin = req.session.adminId;
    const settings = getSettingsWithDefaults();
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
router.post('/users/create', requireLogin, async (req, res) => {
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
router.post('/users/change-credentials', requireLogin, async (req, res) => {
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
router.post('/users/change-username', requireLogin, async (req, res) => {
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
router.post('/users/change-password', requireLogin, async (req, res) => {
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
router.post('/users/delete', requireLogin, (req, res) => {
    const { id } = req.body;
    if (!id || Number(id) === req.session.adminId) {
        return res.redirect('/admin/users?msg=Cannot delete your own account');
    }
    db.prepare('DELETE FROM admin WHERE id = ?').run(id);
    res.redirect('/admin/users?msg=Admin deleted');
});

// Admin: Serve client images (for admin upload page)
router.get('/client-images/:clientId/:filename', requireLogin, (req, res) => {
    const { clientId, filename } = req.params;

    // Verify the image belongs to this client in the database
    const image = db.prepare('SELECT * FROM client_images WHERE client_id = ? AND filename = ?')
        .get(clientId, filename);

    if (!image) {
        return res.status(404).send('Image not found');
    }

    const filePath = path.join(CLIENT_UPLOADS_DIR, clientId.toString(), filename);

    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('Image not found');
    }
});

// Admin: Client management page
router.get('/clients', requireLogin, (req, res) => {
    const clients = getAllClients();
    const settings = getSettingsWithDefaults();
    res.render('admin-clients', {
        clients,
        settings,
        req,
        showAdminNav: true,
        loggedIn: true
    });
});

// Admin: Create new client page
router.get('/clients/new', requireLogin, (req, res) => {
    const settings = getSettingsWithDefaults();
    res.render('admin-client-new', {
        settings,
        req,
        showAdminNav: true,
        loggedIn: true
    });
});

// Admin: Create new client
router.post('/clients/create', requireLogin, async (req, res) => {
    const { clientName, shootTitle, password, customExpiry } = req.body;
    if (!clientName || !password) {
        return res.redirect('/admin/clients/new?error=Name and password required');
    }
    try {
        const expiryDate = customExpiry ? new Date(customExpiry) : null;
        const result = createClient(clientName, shootTitle, password, expiryDate);
        res.redirect(`/admin/clients/${result.id}/upload?created=true&code=${result.accessCode}`);
    } catch (err) {
        console.error('Error creating client:', err);
        res.redirect('/admin/clients/new?error=Failed to create client');
    }
});

// Admin: Upload images for client (with multer)
const clientStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const clientDir = path.join(CLIENT_UPLOADS_DIR, req.params.clientId);
        if (!fs.existsSync(clientDir)) {
            fs.mkdirSync(clientDir, { recursive: true });
        }
        cb(null, clientDir);
    },
    filename: function (req, file, cb) {
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        cb(null, `${timestamp}-${uuidv4()}${ext}`);
    }
});
const clientUpload = multer({
    storage: clientStorage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files allowed'), false);
        }
    },
    limits: { fileSize: 50 * 1024 * 1024 }
});

router.get('/clients/:clientId/upload', requireLogin, (req, res) => {
    try {
        const clientId = req.params.clientId;
        const clientData = getClientById(clientId);
        if (!clientData) {
            return res.status(404).send('Client not found');
        }
        const images = getClientImages(clientId);
        const settings = getSettingsWithDefaults();
        res.render('admin-client-upload', {
            clientData,
            images,
            settings,
            req,
            showAdminNav: true,
            loggedIn: true
        });
    } catch (error) {
        console.error('Error in route:', error);
        res.status(500).send('Error: ' + error.message);
    }
});

router.post('/clients/:clientId/upload', requireLogin, clientUpload.array('images', 50), (req, res) => {
    const clientId = req.params.clientId;
    if (req.files) {
        req.files.forEach(file => {
            addClientImage(clientId, file.filename, file.originalname, file.size);
        });
    }
    res.redirect(`/admin/clients/${clientId}/upload?uploaded=${req.files ? req.files.length : 0}`);
});

// Admin: Upload images (multiple files, protected) -- RATE LIMITED
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../public/images/tmp'));
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
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
    limits: { fileSize: 10 * 1024 * 1024 }
});

router.post('/upload', requireLogin, adminLimiter, upload.array('images', 20), async (req, res, next) => {
    try {
        const category = req.body.category;
        if (!isSafeCategory(category)) {
            return res.status(400).send('Invalid category');
        }
        const destDir = path.join(__dirname, '../public/images', category);
        fs.mkdirSync(destDir, { recursive: true });
        const catInfo = getCategoryIdAndMaxPosition(category);
        if (!catInfo) return res.status(400).send('Category not found');
        let maxPos = catInfo.maxPos;
        for (const file of req.files) {
            const tmpPath = file.path;
            const destPath = path.join(destDir, file.filename);
            fs.renameSync(tmpPath, destPath);
            addImage(category, file.filename, ++maxPos, '');
        }
        // Optionally invalidate cache if you use one
        return res.redirect('/admin/manage?msg=Upload successful!');
    } catch (err) {
        next(err);
    }
});

// Admin: Delete client image
router.post('/clients/:clientId/images/:imageId/delete', requireLogin, (req, res) => {
    const { clientId, imageId } = req.params;
    deleteClientImage(parseInt(clientId), parseInt(imageId));
    res.redirect(`/admin/clients/${clientId}/upload?deleted=true`);
});

// Bulk delete client images
router.post('/clients/:clientId/images/bulk-delete', requireLogin, (req, res) => {
    const { clientId } = req.params;
    let imageIds = req.body.imageIds;
    if (!imageIds) return res.redirect(`/admin/clients/${clientId}/upload?msg=No images selected`);
    imageIds = imageIds.split(',').filter(Boolean);
    imageIds.forEach(id => deleteClientImage(parseInt(clientId), parseInt(id)));
    res.redirect(`/admin/clients/${clientId}/upload?msg=Deleted ${imageIds.length} photo(s)!`);
});

// Admin: Delete client
router.post('/clients/:id/delete', requireLogin, (req, res) => {
    const clientId = req.params.id;
    deleteClient(clientId);
    res.redirect('/admin/clients?msg=Client deleted');
});

// Admin: Toggle client status
router.post('/clients/:id/toggle', requireLogin, (req, res) => {
    const clientId = req.params.id;
    toggleClientStatus(clientId);
    res.redirect('/admin/clients?msg=Client status updated');
});

// Create category -- RATE LIMITED
router.post('/create-category', requireLogin, adminLimiter, async (req, res) => {
    let newCategory = req.body.newCategory || '';
    newCategory = newCategory
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');

    if (!isSafeCategory(newCategory) || !newCategory) {
        return res.redirect('/admin/manage?msg=Invalid category name!');
    }
    if (!categoryExists(newCategory)) {
        createCategory(newCategory);
        // Optionally invalidate cache if you use one
    }
    return res.redirect('/admin/manage?msg=Category created!');
});

// Delete category -- RATE LIMITED
router.post('/delete-category', requireLogin, adminLimiter, async (req, res) => {
    const category = req.body.category;
    if (!isSafeCategory(category)) return res.redirect('/admin/manage?msg=Invalid category!');
    if (categoryExists(category)) {
        deleteCategory(category);
        // Remove folder from filesystem
        const catDir = path.join(__dirname, '../public/images', category);
        if (fs.existsSync(catDir)) fs.rmSync(catDir, { recursive: true, force: true });
        // Optionally invalidate cache if you use one
        return res.redirect('/admin/manage?msg=Category deleted!');
    } else {
        return res.redirect('/admin/manage?msg=Category not found!');
    }
});

// Rename category -- RATE LIMITED
router.post('/rename-category', requireLogin, adminLimiter, async (req, res) => {
    const { oldName, newName } = req.body;
    if (!isSafeCategory(oldName) || !isSafeCategory(newName)) {
        return res.redirect('/admin/manage?msg=Invalid category name!');
    }
    if (!categoryExists(oldName)) {
        return res.redirect('/admin/manage?msg=Original category not found!');
    }
    if (categoryExists(newName)) {
        return res.redirect('/admin/manage?msg=Category name already exists!');
    }
    // Update category name in DB
    db.prepare('UPDATE categories SET name = ? WHERE name = ?').run(newName, oldName);
    // Rename folder on disk if exists
    const oldDir = path.join(__dirname, '../public/images', oldName);
    const newDir = path.join(__dirname, '../public/images', newName);
    if (fs.existsSync(oldDir)) {
        fs.renameSync(oldDir, newDir);
    }
    // Optionally invalidate cache if you use one
    return res.redirect('/admin/manage?msg=Category renamed!');
});

// Reorder images -- RATE LIMITED
router.post('/reorder-images', requireLogin, adminLimiter, async (req, res) => {
    const { category, order } = req.body;
    if (!isSafeCategory(category)) return res.redirect('/admin/manage?msg=Invalid category!');
    let orderArr;
    try {
        orderArr = JSON.parse(order);
        if (!Array.isArray(orderArr)) throw new Error();
    } catch {
        return res.redirect('/admin/manage?msg=Invalid order data!');
    }
    saveImageOrder(category, orderArr);
    // Optionally invalidate cache if you use one
    return res.redirect('/admin/manage?msg=Order saved!');
});

// Reorder categories -- RATE LIMITED
router.post('/reorder-categories', requireLogin, adminLimiter, async (req, res) => {
    const { order } = req.body; // order is an array of category names
    if (!Array.isArray(order)) return res.status(400).json({ error: 'Invalid order' });
    order.forEach((catName, idx) => {
        db.prepare('UPDATE categories SET position = ? WHERE name = ?').run(idx, catName);
    });
    // Optionally invalidate cache if you use one
    res.json({ success: true });
});

// Set category thumbnail -- RATE LIMITED
router.post('/set-thumbnail', requireLogin, adminLimiter, async (req, res) => {
    const { category, filename } = req.body;
    if (!isSafeCategory(category) || !filename || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ error: 'Invalid request' });
    }
    const filePath = path.join(__dirname, '../public/images', category, filename);
    if (!fs.existsSync(filePath)) {
        return res.status(400).json({ error: 'Image not found' });
    }
    setCategoryThumbnail(category, filename);
    // Optionally invalidate cache if you use one
    return res.json({ success: true });
});

// Update alt text for an image -- RATE LIMITED
router.post('/update-alt-text', requireLogin, adminLimiter, (req, res) => {
    const { imageId, altText } = req.body;
    if (!imageId) return res.status(400).json({ error: 'Missing image ID' });
    updateAltText(imageId, altText);
    res.json({ success: true });
});

// Move image to another category -- RATE LIMITED
router.post('/move-image', requireLogin, adminLimiter, async (req, res) => {
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
    const destDir = path.join(__dirname, '../public/images', toCategory);
    fs.mkdirSync(destDir, { recursive: true });
    let moved = 0;
    for (const filename of filenames) {
        const srcPath = path.join(__dirname, '../public/images', fromCategory, filename);
        const destPath = path.join(destDir, filename);
        if (!fs.existsSync(srcPath)) continue;
        fs.renameSync(srcPath, destPath);
        deleteImage(fromCategory, filename);
        const { maxPos } = require('../utils').getCategoryIdAndMaxPosition(toCategory);
        addImage(toCategory, filename, maxPos + 1, '');
        moved++;
    }
    // Optionally invalidate cache if you use one
    return res.json({ success: true, moved });
});

// Delete image route (protected) -- RATE LIMITED
router.post('/delete-image', requireLogin, adminLimiter, async (req, res) => {
    const { category, filename } = req.body;
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
        return res.status(400).send('Invalid filename');
    }
    if (!isSafeCategory(category) || !filename || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ error: 'Invalid request' });
    }
    // Remove file from filesystem
    const filePath = path.join(__dirname, '../public/images', category, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    deleteImage(category, filename);
    // Optionally invalidate cache if you use one
    return res.sendStatus(200);
});

// Bulk delete images route (protected) -- RATE LIMITED
router.post('/bulk-delete-images', requireLogin, adminLimiter, async (req, res) => {
    const { category, filenames } = req.body;
    if (!isSafeCategory(category) || !Array.isArray(filenames)) {
        return res.status(400).json({ error: 'Invalid request' });
    }
    for (const filename of filenames) {
        const filePath = path.join(__dirname, '../public/images', category, filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        deleteImage(category, filename);
    }
    // Optionally invalidate cache if you use one
    return res.json({ deleted: filenames });
});

// Admin About editor (GET)
router.get('/about', requireLogin, (req, res) => {
    const about = db.prepare('SELECT * FROM about LIMIT 1').get();
    const settings = getSettingsWithDefaults();
    res.render('admin-about', {
        about,
        req,
        settings,
        showAdminNav: req.session && req.session.loggedIn,
        loggedIn: req.session && req.session.loggedIn
    });
});

// Update About bio (markdown only)
router.post('/about/bio', requireLogin, (req, res) => {
    const markdown = req.body.markdown || '';
    db.prepare('UPDATE about SET markdown = ? WHERE id = 1').run(markdown);
    res.redirect('/admin/about?msg=Bio saved!');
});

// About image upload (with multer)
const aboutUpload = multer({ dest: path.join(__dirname, '../public/uploads/') });
router.post('/about/image', requireLogin, aboutUpload.single('image'), (req, res) => {
    let imagePath = req.body.currentImage;
    if (req.file) {
        imagePath = '/uploads/' + req.file.filename;
    }
    const about = db.prepare('SELECT * FROM about LIMIT 1').get();
    db.prepare('UPDATE about SET markdown = ?, image_path = ? WHERE id = 1')
        .run(about.markdown || '', imagePath);
    res.redirect('/admin/about?msg=Image saved!');
});

router.post('/about/delete-image', requireLogin, (req, res) => {
    db.prepare('UPDATE about SET image_path = NULL WHERE id = 1').run();
    res.redirect('/admin/about?msg=Image deleted!');
});

// Admin: Backup and restore routes (GET, POST, download, delete, bulk-action, restore, restore-selected)
const BACKUP_DIR = path.join(__dirname, '../data/backups');
const backupUpload = multer({ dest: BACKUP_DIR });

// GET: List all backups
router.get('/backup', requireLogin, (req, res) => {
    const backups = backupUtils.listBackups();
    const settings = getSettingsWithDefaults();
    res.render('admin-settings', {
        req,
        settings,
        serverBackups: backups,
        backupLimit: backupUtils.BACKUP_LIMIT_BYTES,
        showAdminNav: req.session && req.session.loggedIn,
        loggedIn: req.session && req.session.loggedIn,
        msg: req.query.msg || null
    });
});

// POST: Create a new backup
router.post('/backup', requireLogin, (req, res) => {
    try {
        const backupFile = backupUtils.createBackup();
        res.redirect('/admin/settings?msg=Backup created: ' + path.basename(backupFile));
    } catch (err) {
        res.redirect('/admin/settings?msg=Failed to create backup: ' + err.message);
    }
});

// GET: Download a backup file
router.get('/backup/download/:filename', requireLogin, (req, res) => {
    const { filename } = req.params;
    if (!/^[\w.-]+\.zip$/.test(filename)) return res.status(400).send('Invalid filename');
    const filePath = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).send('Backup not found');
    res.download(filePath, filename);
});

// POST: Delete a backup file
router.post('/backup/delete/:filename', requireLogin, (req, res) => {
    const { filename } = req.params;
    if (!/^[\w.-]+\.zip$/.test(filename)) return res.status(400).send('Invalid filename');
    const filePath = path.join(BACKUP_DIR, filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.redirect('/admin/settings?msg=Backup deleted');
    } else {
        res.redirect('/admin/settings?msg=Backup not found');
    }
});

// POST: Bulk backup action (delete or download)
router.post('/backup/bulk-action', requireLogin, (req, res) => {
    const { action, filenames } = req.body;
    if (!Array.isArray(filenames) || !filenames.length) {
        return res.redirect('/admin/settings?msg=No backups selected');
    }
    if (action === 'delete') {
        let deleted = 0;
        filenames.forEach(filename => {
            if (/^[\w.-]+\.zip$/.test(filename)) {
                const filePath = path.join(BACKUP_DIR, filename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    deleted++;
                }
            }
        });
        return res.redirect(`/admin/settings?msg=Deleted ${deleted} backup(s)`);
    } else if (action === 'download') {
        // Create a zip of selected backups
        const archiveName = `backups-bulk-${Date.now()}.zip`;
        const archivePath = path.join(BACKUP_DIR, archiveName);
        const output = fs.createWriteStream(archivePath);
        const archive = archiver('zip');
        archive.pipe(output);
        filenames.forEach(filename => {
            if (/^[\w.-]+\.zip$/.test(filename)) {
                const filePath = path.join(BACKUP_DIR, filename);
                if (fs.existsSync(filePath)) {
                    archive.file(filePath, { name: filename });
                }
            }
        });
        archive.finalize().then(() => {
            res.download(archivePath, archiveName, err => {
                fs.unlinkSync(archivePath);
            });
        });
    } else {
        res.redirect('/admin/settings?msg=Invalid action');
    }
});

// POST: Restore from uploaded backup file
router.post('/restore', requireLogin, backupUpload.single('backupFile'), async (req, res) => {
    if (!req.file) return res.redirect('/admin/settings?msg=No file uploaded');
    try {
        await backupUtils.restoreBackup(req.file.path);
        fs.unlinkSync(req.file.path);
        res.redirect('/admin/settings?msg=Backup restored!');
    } catch (err) {
        res.redirect('/admin/settings?msg=Failed to restore: ' + err.message);
    }
});

// POST: Restore from selected backup file
router.post('/restore-selected', requireLogin, async (req, res) => {
    const { filename } = req.body;
    if (!/^[\w.-]+\.zip$/.test(filename)) return res.redirect('/admin/settings?msg=Invalid filename');
    const filePath = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(filePath)) return res.redirect('/admin/settings?msg=Backup not found');
    try {
        await backupUtils.restoreBackup(filePath);
        res.redirect('/admin/settings?msg=Backup restored!');
    } catch (err) {
        res.redirect('/admin/settings?msg=Failed to restore: ' + err.message);
    }
});

// ...more /admin routes can be moved here...

module.exports = router;
