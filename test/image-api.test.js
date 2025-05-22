require('dotenv').config({ path: '.env.test' });
const request = require('supertest');
const app = require('../server');
const { createCategory, addImage, getOrderedImages, deleteImage, deleteCategory } = require('../utils');

describe('Image API', () => {
    const agent = request.agent(app);
    const username = process.env.TEST_ADMIN_USER;
    const password = process.env.TEST_ADMIN_PASS;
    const testCategory = 'apitestimgcat';
    const testImage = 'apitestimg.jpg';

    beforeAll(async () => {
        if (app.testAdminReady) {
            await app.testAdminReady;
        }
        createCategory(testCategory);
        addImage(testCategory, testImage, 1, 'original alt');
        await agent
            .post('/login')
            .send(`username=${username}&password=${password}`)
            .set('Content-Type', 'application/x-www-form-urlencoded');
    });

    afterAll(() => {
        deleteImage(testCategory, testImage);
        deleteCategory(testCategory);
    });

    it('should update alt text for an image', async () => {
        const images = getOrderedImages(testCategory);
        expect(images.length).toBeGreaterThan(0);
        const imageId = images[0].id;

        const res = await agent
            .post('/update-alt-text')
            .send({ imageId, altText: 'new alt text' });
        expect([200, 302]).toContain(res.statusCode);
        if (res.statusCode === 200) {
            expect(res.body.success).toBe(true);
        }
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