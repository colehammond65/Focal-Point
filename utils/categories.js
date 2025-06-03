// Utility functions for managing categories in the gallery.
// Includes functions to get categories, check for safe names, create, delete, and check existence of categories.
//
// Exports:
//   - getCategoriesWithPreviews: Get categories with preview images.
//   - isSafeCategory: Validate category name safety.
//   - categoryExists: Check if a category exists.
//   - createCategory: Create a new category.
//   - deleteCategory: Delete a category.
//   - getCategoriesWithImages: Get categories with their images.
//   - getCategoryIdAndMaxPosition: Get category ID and max image position.

const db = require('../db');

function getCategoriesWithPreviews() {
    const cats = db.prepare('SELECT * FROM categories ORDER BY position ASC').all();
    return cats.map(cat => {
        let thumb = db.prepare('SELECT filename FROM images WHERE category_id = ? AND is_thumbnail = 1').get(cat.id);
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
function getCategoriesWithImages() {
    const cats = getCategoriesWithPreviews();
    return cats.map(cat => ({
        ...cat,
        images: getOrderedImages(cat.name)
    }));
}
function getCategoryIdAndMaxPosition(categoryName) {
    const cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(categoryName);
    if (!cat) return null;
    const maxPos = db.prepare('SELECT MAX(position) as max FROM images WHERE category_id = ?').get(cat.id).max || 0;
    return { id: cat.id, maxPos };
}

// This import must be after function declarations to avoid circular dependency
const { getOrderedImages } = require('./images');

module.exports = {
    getCategoriesWithPreviews,
    isSafeCategory,
    categoryExists,
    createCategory,
    deleteCategory,
    getCategoriesWithImages,
    getCategoryIdAndMaxPosition
};