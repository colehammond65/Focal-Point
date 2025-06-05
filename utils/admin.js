// utils/admin.js
// Utility functions for admin user management: existence check, creation, retrieval, and verification.
const bcrypt = require('bcryptjs');
const validator = require('validator');
const { getDb, ready } = require('../db');

// Returns true if any admin exists
async function adminExists() {
    await ready;
    const db = getDb();
    return !!db.prepare('SELECT 1 FROM admin LIMIT 1').get();
}
// Creates a new admin user with hashed password
async function createAdmin(username, password) {
    await ready;
    const db = getDb();
    username = validator.trim(username);
    username = validator.escape(username).slice(0, 32);
    password = validator.stripLow(password, true).slice(0, 64);
    if (!username || !password || username.length < 3 || password.length < 8) {
        throw new Error('Invalid username or password');
    }
    const hash = await bcrypt.hash(password, 12);
    db.prepare('INSERT INTO admin (username, hash) VALUES (?, ?)').run(username, hash);
}
// Retrieves the first admin user
async function getAdmin() {
    const { getDb, ready } = require('../db');
    await ready;
    const db = getDb();
    return db.prepare('SELECT * FROM admin LIMIT 1').get();
}
// Verifies admin credentials and returns admin if valid
async function verifyAdmin(username, password) {
    const { getDb, ready } = require('../db');
    await ready;
    const db = getDb();
    username = validator.trim(username);
    username = validator.escape(username).slice(0, 32);
    password = validator.stripLow(password, true).slice(0, 64);
    const admin = db.prepare('SELECT * FROM admin WHERE username = ?').get(username);
    if (!admin) return false;
    const match = await bcrypt.compare(password, admin.hash);
    return match ? admin : false;
}

module.exports = {
    adminExists,
    createAdmin,
    getAdmin,
    verifyAdmin
};