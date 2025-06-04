// utils/admin.js
// Utility functions for admin user management: existence check, creation, retrieval, and verification.
const bcrypt = require('bcryptjs');
const validator = require('validator');
const db = require('../db');

// Returns true if any admin exists
function adminExists() {
    return !!db.prepare('SELECT 1 FROM admin LIMIT 1').get();
}
// Creates a new admin user with hashed password
async function createAdmin(username, password) {
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
function getAdmin() {
    return db.prepare('SELECT * FROM admin LIMIT 1').get();
}
// Verifies admin credentials and returns admin if valid
function verifyAdmin(username, password) {
    username = validator.trim(username);
    username = validator.escape(username).slice(0, 32);
    password = validator.stripLow(password, true).slice(0, 64);
    const admin = db.prepare('SELECT * FROM admin WHERE username = ?').get(username);
    if (!admin) return false;
    return bcrypt.compare(password, admin.hash).then(match => match ? admin : false);
}

module.exports = {
    adminExists,
    createAdmin,
    getAdmin,
    verifyAdmin
};