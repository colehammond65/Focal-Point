// utils/categoryCache.js
// Provides a simple in-memory cache for categories with preview images to reduce DB load.
const { getCategoriesWithPreviews } = require('./index');

let categoryCache = null;
let categoryCacheTime = 0;
const CATEGORY_CACHE_TTL = 10000; // 10 seconds

// Returns cached categories or refreshes if expired
async function getCachedCategories() {
    const now = Date.now();
    if (!categoryCache || now - categoryCacheTime > CATEGORY_CACHE_TTL) {
        categoryCache = await getCategoriesWithPreviews();
        categoryCacheTime = now;
    }
    return categoryCache;
}

// Invalidates the category cache
function invalidateCategoryCache() {
    categoryCache = null;
    categoryCacheTime = 0;
}

module.exports = {
    getCachedCategories,
    invalidateCategoryCache
};
