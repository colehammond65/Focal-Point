const db = require('../db');

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

module.exports = {
    getOrderedImages,
    saveImageOrder,
    setCategoryThumbnail,
    updateAltText,
    addImage,
    deleteImage
};