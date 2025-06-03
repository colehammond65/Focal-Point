// utils/categoryCache.js
const { getCategoriesWithPreviews } = require('./index');

let categoryCache = null;
let categoryCacheTime = 0;
const CATEGORY_CACHE_TTL = 10000; // 10 seconds

async function getCachedCategories() {
    const now = Date.now();
    if (!categoryCache || now - categoryCacheTime > CATEGORY_CACHE_TTL) {
        categoryCache = await getCategoriesWithPreviews();
        categoryCacheTime = now;
    }
    return categoryCache;
}

function invalidateCategoryCache() {
    categoryCache = null;
    categoryCacheTime = 0;
}

module.exports = {
    getCachedCategories,
    invalidateCategoryCache
};
