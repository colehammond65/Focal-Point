const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const {
    verifyClient,
    getClientImages,
    incrementDownloadCount,
    createZipArchive,
    CLIENT_UPLOADS_DIR
} = require('../utils/clients');
const { getAllSettings } = require('../utils');

// Middleware to protect client routes
function requireClientLogin(req, res, next) {
    if (req.session && req.session.clientLoggedIn) {
        next();
    } else {
        res.redirect('/client/login');
    }
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
    const { accessCode, password } = req.body;
    const client = verifyClient(accessCode, password);

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
router.get('/images/:filename', requireClientLogin, (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(CLIENT_UPLOADS_DIR, req.session.clientId.toString(), filename);

    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('Image not found');
    }
});

// Download single image
router.get('/download/:filename', requireClientLogin, (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(CLIENT_UPLOADS_DIR, req.session.clientId.toString(), filename);

    if (fs.existsSync(filePath)) {
        // You may want to fetch the original filename from DB if needed
        res.download(filePath, filename);
    } else {
        res.status(404).send('Image not found');
    }
});

// Download all images as ZIP
router.get('/download-all', requireClientLogin, (req, res) => {
    try {
        const { archive, zipName } = createZipArchive(req.session.clientId);
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
router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/client/login');
    });
});

// Client gallery (shows their images)
router.get('/gallery', requireClientLogin, (req, res) => {
    const clientId = req.session.clientId;
    const images = getClientImages(clientId);
    const settings = getAllSettings();
    res.render('client-gallery', {
        images,
        clientName: req.session.clientName,
        shootTitle: req.session.shootTitle,
        settings,
        showAdminNav: false,
        loggedIn: false
    });
});

module.exports = router;
