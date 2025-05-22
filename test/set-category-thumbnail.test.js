require('dotenv').config({ path: '.env.test' });
const request = require('supertest');
const app = require('../server');
const { createCategory, addImage, getOrderedImages, deleteCategory } = require('../utils');
const fs = require('fs');
const path = require('path');

describe('Set Category Thumbnail API', () => {
    const agent = request.agent(app);
    const username = process.env.TEST_ADMIN_USER;
    const password = process.env.TEST_ADMIN_PASS;
    const testCategory = 'thumbcat';
    const testImage = 'thumb.jpg';

    beforeAll(async () => {
        if (app.testAdminReady) {
            await app.testAdminReady;
        }
        createCategory(testCategory);
        addImage(testCategory, testImage, 1, 'alt');
        // Create a dummy file so the endpoint doesn't fail on fs.existsSync
        const imgDir = path.join(__dirname, '../public/images', testCategory);
        fs.mkdirSync(imgDir, { recursive: true });
        fs.writeFileSync(path.join(imgDir, testImage), 'dummy');
        await agent
            .post('/login')
            .send(`username=${username}&password=${password}`)
            .set('Content-Type', 'application/x-www-form-urlencoded');
    });

    afterAll(() => {
        deleteCategory(testCategory);
        // Optionally clean up the dummy file
        const imgDir = path.join(__dirname, '../public/images', testCategory);
        try { fs.rmSync(imgDir, { recursive: true, force: true }); } catch { }
    });

    it('should set category thumbnail', async () => {
        const res = await agent
            .post('/set-thumbnail')
            .send({ category: testCategory, filename: testImage })
            .set('Content-Type', 'application/json');
        expect([200, 302]).toContain(res.statusCode);
        if (res.statusCode === 200) {
            expect(res.body.success).toBe(true);
        }
    });
});