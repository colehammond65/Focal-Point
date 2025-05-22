const path = require('path');
const db = require('../db');
const {
    isSafeCategory,
    categoryExists,
    createCategory,
    deleteCategory,
    getCategoriesWithPreviews,
    getOrderedImages,
    updateAltText,
    addImage,
    deleteImage,
    adminExists,
    createAdmin,
    verifyAdmin
} = require('../utils');

beforeAll(async () => {
    await db.ready;
});

describe('Category Utilities', () => {
    const testCategory = 'testcat';

    afterAll(() => {
        deleteCategory(testCategory);
    });

    test('isSafeCategory allows safe names', () => {
        expect(isSafeCategory('my-category')).toBe(true);
        expect(isSafeCategory('cat123')).toBe(true);
    });

    test('isSafeCategory rejects reserved or unsafe names', () => {
        expect(isSafeCategory('con')).toBe(false);
        expect(isSafeCategory('bad/name')).toBe(false);
        expect(isSafeCategory('')).toBe(false);
    });

    test('createCategory and categoryExists', () => {
        createCategory(testCategory);
        expect(categoryExists(testCategory)).toBe(true);
    });

    test('getCategoriesWithPreviews returns array', () => {
        const cats = getCategoriesWithPreviews();
        expect(Array.isArray(cats)).toBe(true);
    });
});

describe('Image Utilities', () => {
    const testCategory = 'testcat2';
    const testImage = 'testimg.jpg';

    beforeAll(() => {
        createCategory(testCategory);
        addImage(testCategory, testImage, 1, 'alt text');
    });

    afterAll(() => {
        deleteImage(testCategory, testImage);
        deleteCategory(testCategory);
    });

    test('getOrderedImages returns images', () => {
        const images = getOrderedImages(testCategory);
        expect(Array.isArray(images)).toBe(true);
        expect(images.length).toBeGreaterThan(0);
        expect(images[0].filename).toBe(testImage);
    });

    test('updateAltText updates alt text', () => {
        const images = getOrderedImages(testCategory);
        const img = images[0];
        updateAltText(img.id, 'new alt');
        const updated = getOrderedImages(testCategory)[0];
        expect(updated.alt_text).toBe('new alt');
    });
});