// routes/client.js
// Client routes for secure gallery access, image downloads, and client authentication.
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const validator = require('validator');
const {
    verifyClient,
    getActiveClientById,
    getClientImages,
    incrementDownloadCount,
    createZipArchive,
    CLIENT_UPLOADS_DIR
} = require('../utils/clients');
const { getAllSettings } = require('../utils');

// Middleware to protect client routes
// Ensures the user is logged in as a client
async function requireClientLogin(req, res, next) {
    if (!req.session || !req.session.clientLoggedIn || !req.session.clientId) {
        return res.redirect('/client/login');
    }

    const client = await getActiveClientById(req.session.clientId);
    if (!client) {
        req.session.destroy(() => res.redirect('/client/login'));
        return;
    }

    req.session.clientName = client.client_name;
    req.session.shootTitle = client.shoot_title;
    next();
}

// Helper to validate uploaded file is a real image
async function isRealImage(filePath) {
    const { fileTypeFromFile } = await import('file-type');
    const type = await fileTypeFromFile(filePath);
    if (!type) return false;
    return ['image/png', 'image/jpeg', 'image/gif'].includes(type.mime);
}

// Client login page (password only)
router.get('/login', (req, res) => {
    const settings = getAllSettings();
    res.render('client-login', {
        error: null,
        settings,
        showAdminNav: false,
        loggedIn: false
    });
});

// Client login handler (access code and password)
router.post('/login', async (req, res) => {
    let accessCode = typeof req.body.accessCode === 'string' ? validator.trim(req.body.accessCode) : '';
    accessCode = validator.escape(accessCode).slice(0, 16);
    let password = typeof req.body.password === 'string' ? req.body.password : '';
    password = validator.stripLow(password, true).slice(0, 64);
    if (!accessCode || !password) {
        const settings = getAllSettings();
        return res.render('client-login', {
            error: 'Access code and password are required',
            settings,
            showAdminNav: false,
            loggedIn: false
        });
    }
    const client = await verifyClient(accessCode, password);

    if (client) {
        req.session.clientLoggedIn = true;
        req.session.clientId = client.id;
        req.session.clientName = client.client_name;
        req.session.shootTitle = client.shoot_title;
        res.redirect('/client/gallery');
    } else {
        const settings = getAllSettings();
        res.render('client-login', {
            error: 'Invalid access code or password, or access expired',
            settings,
            showAdminNav: false,
            loggedIn: false
        });
    }
});

// Secure client image serving
// Serves images securely to logged-in clients
router.get('/images/:filename', requireClientLogin, async (req, res) => {
  const filename = req.params.filename;
  if (!/^[\w.-]+$/.test(filename)) return res.status(400).send('Invalid filename');

  const width = Number.parseInt(req.query.w, 10);
  const height = Number.parseInt(req.query.h, 10);
  const clientDir = path.join(CLIENT_UPLOADS_DIR, req.session.clientId.toString());
  const filePath = path.resolve(clientDir, filename);
  if (!filePath.startsWith(path.resolve(clientDir) + path.sep)) return res.status(400).send('Invalid filename');

  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    if (width || height) {
      const sharp = require('sharp');
      res.type(path.extname(filename).slice(1) || 'jpeg');
      return sharp(filePath).resize(width || null, height || null, { fit: 'inside' }).pipe(res);
    }
    return res.sendFile(filePath);
  } catch {
    return res.status(404).send('Image not found');
  }
});

// Download single image
// Allows clients to download individual images
router.get('/download/:filename', requireClientLogin, (req, res) => {
    const filename = req.params.filename;
    if (!/^[\w.-]+$/.test(filename)) return res.status(400).send('Invalid filename');
    const filePath = path.join(CLIENT_UPLOADS_DIR, req.session.clientId.toString(), filename);

    fs.promises.access(filePath, fs.constants.F_OK)
        .then(() => res.download(filePath, filename))
        .catch(() => res.status(404).send('Image not found'));
});

// Download all images as ZIP
// Allows clients to download all their images as a ZIP archive
router.get('/download-all', requireClientLogin, async (req, res) => {
    try {
        const { archive, zipName } = await createZipArchive(req.session.clientId);
        archive.on('error', err => {
            console.error('Error creating zip:', err);
            res.status(500).send('Error creating download');
        });
        incrementDownloadCount(req.session.clientId);

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

        archive.pipe(res);
    } catch (err) {
        console.error('Error creating zip:', err);
        res.status(500).send('Error creating download');
    }
});

// Client logout
// Logs out the client and destroys their session
router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/client/login');
    });
});

// Client gallery (shows their images)
// Displays the gallery of images for the logged-in client
router.get('/gallery', requireClientLogin, async (req, res) => {
    const clientId = req.session.clientId;
    const images = await getClientImages(clientId);
    const settings = await getAllSettings();
    res.render('client-gallery', {
        images,
        clientId,
        clientName: req.session.clientName,
        shootTitle: req.session.shootTitle,
        settings,
        showAdminNav: false,
        loggedIn: false
    });
});

module.exports = router;
