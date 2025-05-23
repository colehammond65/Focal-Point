const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');

// ADMIN
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

// CATEGORIES
function getCategoriesWithPreviews() {
    const cats = db.prepare('SELECT * FROM categories ORDER BY position ASC').all();
    return cats.map(cat => {
        // Try to get the manually set thumbnail
        let thumb = db.prepare('SELECT filename FROM images WHERE category_id = ? AND is_thumbnail = 1').get(cat.id);
        // If not set, pick the first image by position as fallback
        if (!thumb) {
            thumb = db.prepare('SELECT filename FROM images WHERE category_id = ? ORDER BY position ASC LIMIT 1').get(cat.id);
        }
        return {
            name: cat.name,
            preview: thumb ? thumb.filename : null
        };
    });
}
function isSafeCategory(category) {
    const reserved = ['con', 'aux', 'nul', 'prn', 'com1', 'lpt1', 'tmp'];
    return typeof category === 'string'
        && /^[\w-]+$/.test(category)
        && !reserved.includes(category.toLowerCase())
        && category.length <= 50;
}
function categoryExists(name) {
    return !!db.prepare('SELECT 1 FROM categories WHERE name = ?').get(name);
}
function createCategory(name) {
    const maxPos = db.prepare('SELECT MAX(position) as max FROM categories').get().max || 0;
    db.prepare('INSERT INTO categories (name, position) VALUES (?, ?)').run(name, maxPos + 1);
}
function deleteCategory(name) {
    const cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(name);
    if (cat) {
        db.prepare('DELETE FROM images WHERE category_id = ?').run(cat.id);
        db.prepare('DELETE FROM categories WHERE id = ?').run(cat.id);
    }
}

// IMAGES
function getOrderedImages(categoryName) {
    const cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(categoryName);
    if (!cat) return [];
    return db.prepare('SELECT id, filename, alt_text FROM images WHERE category_id = ? ORDER BY position ASC').all(cat.id);
}
function saveImageOrder(categoryName, orderArr) {
    const cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(categoryName);
    if (!cat) return;
    orderArr.forEach((filename, idx) => {
        db.prepare('UPDATE images SET position = ? WHERE category_id = ? AND filename = ?').run(idx, cat.id, filename);
    });
}
function setCategoryThumbnail(categoryName, filename) {
    const cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(categoryName);
    if (!cat) return;
    db.prepare('UPDATE images SET is_thumbnail = 0 WHERE category_id = ?').run(cat.id);
    db.prepare('UPDATE images SET is_thumbnail = 1 WHERE category_id = ? AND filename = ?').run(cat.id, filename);
}
function updateAltText(imageId, altText) {
    db.prepare('UPDATE images SET alt_text = ? WHERE id = ?').run(altText, imageId);
}
function addImage(categoryName, filename, position, altText = '') {
    const cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(categoryName);
    if (!cat) return;
    db.prepare('INSERT INTO images (category_id, filename, position, alt_text) VALUES (?, ?, ?, ?)')
        .run(cat.id, filename, position, altText);
}
function deleteImage(category, filename) {
    const cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(category);
    if (!cat) return;
    db.prepare('DELETE FROM images WHERE category_id = ? AND filename = ?').run(cat.id, filename);
}

function getCategoryIdAndMaxPosition(categoryName) {
    const cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(categoryName);
    if (!cat) return null;
    const maxPos = db.prepare('SELECT MAX(position) as max FROM images WHERE category_id = ?').get(cat.id).max || 0;
    return { id: cat.id, maxPos };
}

function getCategoriesWithImages() {
    const cats = getCategoriesWithPreviews();
    return cats.map(cat => ({
        ...cat,
        images: getOrderedImages(cat.name)
    }));
}

// SETTINGS
function getSetting(key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
}
function setSetting(key, value) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}
function getAllSettings() {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    rows.forEach(row => settings[row.key] = row.value);
    return settings;
}

module.exports = {
    getCategoriesWithPreviews,
    isSafeCategory,
    getOrderedImages,
    categoryExists,
    createCategory,
    deleteCategory,
    deleteImage,
    saveImageOrder,
    setCategoryThumbnail,
    adminExists,
    createAdmin,
    getAdmin,
    verifyAdmin,
    updateAltText,
    addImage,
    getCategoriesWithImages,
    getCategoryIdAndMaxPosition,
    getSetting,
    setSetting,
    getAllSettings
};