const bcrypt = require('bcryptjs');
const db = require('../db');

function adminExists() {
    return !!db.prepare('SELECT 1 FROM admin LIMIT 1').get();
}
async function createAdmin(username, password) {
    const hash = await bcrypt.hash(password, 12);
    db.prepare('INSERT INTO admin (username, hash) VALUES (?, ?)').run(username, hash);
}
function getAdmin() {
    return db.prepare('SELECT * FROM admin LIMIT 1').get();
}
function verifyAdmin(username, password) {
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