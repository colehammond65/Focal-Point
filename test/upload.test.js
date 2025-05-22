require('dotenv').config({ path: '.env.test' });
const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../server');
const db = require('../db');
const { createCategory, deleteCategory, getOrderedImages, deleteImage } = require('../utils');

describe('Image Upload API', () => {
    const agent = request.agent(app);
    const username = process.env.TEST_ADMIN_USER;
    const password = process.env.TEST_ADMIN_PASS;
    const testCategory = 'uploadcat';
    const testImageName = 'test-upload.jpg';
    const testImagePath = path.join(__dirname, testImageName);

    beforeAll(async () => {
        await db.ready;
        if (app.testAdminReady) {
            await app.testAdminReady;
        }

        // Create a dummy image file (1x1 px PNG)
        const imgBuffer = Buffer.from(
            '89504e470d0a1a0a0000000d4948445200000001000000010802000000907724' +
            '0000000a49444154789c6360000002000100a2f7a2d20000000049454e44ae426082',
            'hex'
        );
        fs.writeFileSync(testImagePath, imgBuffer);

        createCategory(testCategory);

        // Ensure the category directory exists for upload
        const imgDir = path.join(__dirname, '../public/images', testCategory);
        fs.mkdirSync(imgDir, { recursive: true });

        await agent
            .post('/login')
            .send(`username=${username}&password=${password}`)
            .set('Content-Type', 'application/x-www-form-urlencoded');
    });

    afterAll(() => {
        // Clean up: delete uploaded image and category
        const images = getOrderedImages(testCategory);
        images.forEach(img => deleteImage(testCategory, img.filename));
        deleteCategory(testCategory);
        if (fs.existsSync(testImagePath)) fs.unlinkSync(testImagePath);
        // Remove the category directory
        const imgDir = path.join(__dirname, '../public/images', testCategory);
        try { fs.rmSync(imgDir, { recursive: true, force: true }); } catch { }
    });

    it('should upload an image file', async () => {
        const res = await agent
            .post('/upload')
            .field('category', testCategory)
            .attach('images', testImagePath);

        expect([200, 302]).toContain(res.statusCode);

        // Check that the image is now in the DB
        const images = getOrderedImages(testCategory);
        expect(images.length).toBeGreaterThan(0);
    });
});