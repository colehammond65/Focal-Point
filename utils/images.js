// Utility functions for managing images in categories.
// Includes functions to get, add, delete, update, and reorder images, as well as set thumbnails and alt text.
//
// Exports:
//   - getOrderedImages: Get all images in a category, ordered by position.
//   - saveImageOrder: Save the order of images in a category.
//   - setCategoryThumbnail: Set a specific image as the category thumbnail.
//   - updateAltText: Update the alt text for an image.
//   - addImage: Add a new image to a category.
//   - deleteImage: Delete an image from a category.
//   - getMaxImagePosition: Get the max position value for images in a category.

const { getDb, ready } = require('../db');

// Get all images in a category, ordered by position
async function getOrderedImages(categoryName) {
    await ready;
    const db = getDb();
    const cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(categoryName);
    if (!cat) return [];
    return db.prepare('SELECT id, filename, alt_text FROM images WHERE category_id = ? ORDER BY position ASC').all(cat.id);
}

// Save the order of images in a category
async function saveImageOrder(categoryName, orderArr) {
    await ready;
    const db = getDb();
    const cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(categoryName);
    if (!cat) return;
    orderArr.forEach((filename, idx) => {
        db.prepare('UPDATE images SET position = ? WHERE category_id = ? AND filename = ?').run(idx, cat.id, filename);
    });
}

// Set a specific image as the thumbnail for a category
async function setCategoryThumbnail(categoryName, filename) {
    await ready;
    const db = getDb();
    const cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(categoryName);
    if (!cat) return;
    db.prepare('UPDATE images SET is_thumbnail = 0 WHERE category_id = ?').run(cat.id);
    db.prepare('UPDATE images SET is_thumbnail = 1 WHERE category_id = ? AND filename = ?').run(cat.id, filename);
}

// Update the alt text for an image by its ID
async function updateAltText(imageId, altText) {
    await ready;
    const db = getDb();
    db.prepare('UPDATE images SET alt_text = ? WHERE id = ?').run(altText, imageId);
}

// Add a new image to a category with optional alt text
async function addImage(categoryName, filename, position, altText = '') {
    await ready;
    const db = getDb();
    const cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(categoryName);
    if (!cat) return;
    db.prepare('INSERT INTO images (category_id, filename, position, alt_text) VALUES (?, ?, ?, ?)')
        .run(cat.id, filename, position, altText);
}

// Delete an image from a category by filename
async function deleteImage(category, filename) {
    await ready;
    const db = getDb();
    const cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(category);
    if (!cat) return;
    db.prepare('DELETE FROM images WHERE category_id = ? AND filename = ?').run(cat.id, filename);
}

// Get the maximum position value for images in a category
async function getMaxImagePosition(categoryName) {
    await ready;
    const db = getDb();
    const cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(categoryName);
    if (!cat) return 0;
    return db.prepare('SELECT MAX(position) as max FROM images WHERE category_id = ?').get(cat.id).max || 0;
}

module.exports = {
    getOrderedImages,
    saveImageOrder,
    setCategoryThumbnail,
    updateAltText,
    addImage,
    deleteImage,
    getMaxImagePosition
};