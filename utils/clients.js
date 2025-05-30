const db = require('../db');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver'); // You'll need to: npm install archiver
const bcrypt = require('bcryptjs'); // Added bcrypt for password hashing

// Ensure client uploads directory exists
const CLIENT_UPLOADS_DIR = path.join(__dirname, '..', 'data', 'client-uploads');
if (!fs.existsSync(CLIENT_UPLOADS_DIR)) {
    fs.mkdirSync(CLIENT_UPLOADS_DIR, { recursive: true });
}

function generateAccessCode() {
    // Generate a simple 6-8 character access code
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function createClient(clientName, shootTitle, password, customExpiry = null) {
    const accessCode = generateAccessCode();

    // Hash the password for security
    const hashedPassword = bcrypt.hashSync(password, 10);

    // Default expiry: 1 month from now
    const expiresAt = customExpiry || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    try {
        const result = db.prepare(`
            INSERT INTO clients (access_code, password, client_name, shoot_title, expires_at)
            VALUES (?, ?, ?, ?, ?)
        `).run(accessCode, hashedPassword, clientName, shootTitle, expiresAt.toISOString());

        // Create client's image directory
        const clientDir = path.join(CLIENT_UPLOADS_DIR, result.lastInsertRowid.toString());
        if (!fs.existsSync(clientDir)) {
            fs.mkdirSync(clientDir, { recursive: true });
        }

        return { id: result.lastInsertRowid, accessCode };
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return createClient(clientName, shootTitle, password, customExpiry);
        }
        throw err;
    }
}

function verifyClient(accessCode, password) {
    const client = db.prepare(`
        SELECT * FROM clients 
        WHERE access_code = ? AND is_active = 1 AND expires_at > datetime('now')
    `).get(accessCode);

    if (client && bcrypt.compareSync(password, client.password)) {
        db.prepare('UPDATE clients SET last_access = datetime(\'now\') WHERE id = ?').run(client.id);
        return client;
    }
    return null;
}

function getClientImages(clientId) {
    return db.prepare(`
        SELECT * FROM client_images 
        WHERE client_id = ? 
        ORDER BY uploaded_at ASC
    `).all(clientId);
}

function addClientImage(clientId, filename, originalFilename, fileSize) {
    return db.prepare(`
        INSERT INTO client_images (client_id, filename, original_filename, file_size)
        VALUES (?, ?, ?, ?)
    `).run(clientId, filename, originalFilename, fileSize);
}

function deleteClientImage(clientId, imageId) {
    const image = db.prepare('SELECT filename FROM client_images WHERE id = ? AND client_id = ?').get(imageId, clientId);
    if (image) {
        // Delete file from filesystem
        const filePath = path.join(CLIENT_UPLOADS_DIR, clientId.toString(), image.filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Delete from database
        db.prepare('DELETE FROM client_images WHERE id = ? AND client_id = ?').run(imageId, clientId);
        return true;
    }
    return false;
}

function getAllClients() {
    return db.prepare(`
        SELECT c.*, 
               COUNT(ci.id) as image_count,
               SUM(ci.file_size) as total_size
        FROM clients c
        LEFT JOIN client_images ci ON c.id = ci.client_id
        GROUP BY c.id
        ORDER BY c.created_at DESC
    `).all();
}

function getClientById(clientId) {
    return db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
}

function deleteClient(clientId) {
    // Delete all client images from filesystem
    const clientDir = path.join(CLIENT_UPLOADS_DIR, clientId.toString());
    if (fs.existsSync(clientDir)) {
        fs.rmSync(clientDir, { recursive: true, force: true });
    }

    // Delete from database (CASCADE will handle client_images)
    db.prepare('DELETE FROM clients WHERE id = ?').run(clientId);
}

function toggleClientStatus(clientId) {
    db.prepare('UPDATE clients SET is_active = NOT is_active WHERE id = ?').run(clientId);
}

function incrementDownloadCount(clientId, imageId = null) {
    db.prepare('UPDATE clients SET download_count = download_count + 1 WHERE id = ?').run(clientId);

    if (imageId) {
        db.prepare('UPDATE client_images SET download_count = download_count + 1 WHERE id = ?').run(imageId);
    }
}

function createZipArchive(clientId) {
    const client = getClientById(clientId);
    const images = getClientImages(clientId);
    const clientDir = path.join(CLIENT_UPLOADS_DIR, clientId.toString());

    const archive = archiver('zip', { zlib: { level: 9 } });
    const zipName = `${client.client_name.replace(/[^a-zA-Z0-9]/g, '_')}_${client.shoot_title ? client.shoot_title.replace(/[^a-zA-Z0-9]/g, '_') : 'Photos'}.zip`;

    images.forEach(image => {
        const filePath = path.join(clientDir, image.filename);
        if (fs.existsSync(filePath)) {
            archive.file(filePath, {
                name: image.original_filename || image.filename
            });
        }
    });

    archive.finalize();

    return { archive, zipName };
}

// Clean up expired clients (run this periodically)
function cleanupExpiredClients() {
    const expiredClients = db.prepare(`
        SELECT id FROM clients 
        WHERE expires_at < datetime('now')
    `).all();

    expiredClients.forEach(client => {
        deleteClient(client.id);
    });

    return expiredClients.length;
}

module.exports = {
    createClient,
    verifyClient, // <-- this now takes (accessCode, password)
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
};