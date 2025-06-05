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

const { getDb, ready } = require('../db');
const validator = require('validator');

async function getCategoriesWithPreviews() {
    await ready;
    const db = getDb();
    const query = `
        SELECT 
            c.name, 
            COALESCE(
                (SELECT filename FROM images WHERE category_id = c.id AND is_thumbnail = 1 LIMIT 1),
                (SELECT filename FROM images WHERE category_id = c.id ORDER BY position ASC LIMIT 1)
            ) AS preview
        FROM categories c
        ORDER BY c.position ASC
    `;
    const cats = await db.prepare(query).all();
    return cats.map(cat => ({
        name: cat.name,
        preview: cat.preview
    }));
}
function isSafeCategory(category) {
    if (typeof category !== 'string') return false;
    category = validator.trim(category);
    if (!/^[\w-]+$/.test(category)) return false;
    const reserved = ['con', 'aux', 'nul', 'prn', 'com1', 'lpt1', 'tmp'];
    return !reserved.includes(category.toLowerCase()) && category.length <= 50;
}
async function categoryExists(name) {
    await ready;
    const db = getDb();
    return !!(await db.prepare('SELECT 1 FROM categories WHERE name = ?').get(name));
}
async function createCategory(name) {
    await ready;
    const db = getDb();
    name = validator.trim(name);
    name = validator.escape(name).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 50);
    if (!(await isSafeCategory(name))) throw new Error('Invalid category name');
    const maxPos = (await db.prepare('SELECT MAX(position) as max FROM categories').get()).max || 0;
    await db.prepare('INSERT INTO categories (name, position) VALUES (?, ?)').run(name, maxPos + 1);
}
async function deleteCategory(name) {
    await ready;
    const db = getDb();
    const cat = await db.prepare('SELECT id FROM categories WHERE name = ?').get(name);
    if (cat) {
        await db.prepare('DELETE FROM images WHERE category_id = ?').run(cat.id);
        await db.prepare('DELETE FROM categories WHERE id = ?').run(cat.id);
    }
}
async function getCategoriesWithImages() {
    await ready;
    const db = getDb();
    const cats = await getCategoriesWithPreviews();
    return await Promise.all(cats.map(async cat => ({
        ...cat,
        images: await getOrderedImages(cat.name)
    })));
}
async function getCategoryIdAndMaxPosition(categoryName) {
    await ready;
    const db = getDb();
    const cat = await db.prepare('SELECT id FROM categories WHERE name = ?').get(categoryName);
    if (!cat) return null;
    const maxPos = (await db.prepare('SELECT MAX(position) as max FROM images WHERE category_id = ?').get(cat.id)).max || 0;
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