const path = require('path');
const bcrypt = require('bcrypt');
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
async function verifyAdmin(username, password) {
    const admin = getAdmin();
    if (!admin || admin.username !== username) return false;
    return await bcrypt.compare(password, admin.hash);
}

// CATEGORIES
function getCategoriesWithPreviews() {
    const cats = db.prepare('SELECT * FROM categories').all();
    return cats.map(cat => {
        const thumb = db.prepare('SELECT filename FROM images WHERE category_id = ? AND is_thumbnail = 1').get(cat.id);
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
    db.prepare('INSERT INTO categories (name) VALUES (?)').run(name);
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

function getCategoriesWithImages() {
    const cats = getCategoriesWithPreviews();
    return cats.map(cat => ({
        ...cat,
        images: getOrderedImages(cat.name)
    }));
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
    getCategoriesWithImages
};