require('dotenv').config({ path: '.env.test' });
const request = require('supertest');
const app = require('../server');
const { createCategory, addImage, getOrderedImages, deleteCategory } = require('../utils');

describe('Bulk Delete Images API', () => {
    const agent = request.agent(app);
    const username = process.env.TEST_ADMIN_USER;
    const password = process.env.TEST_ADMIN_PASS;
    const testCategory = 'bulkdelcat';
    const testImages = ['img1.jpg', 'img2.jpg', 'img3.jpg'];

    beforeAll(async () => {
        if (app.testAdminReady) {
            await app.testAdminReady;
        }
        createCategory(testCategory);
        testImages.forEach((img, i) => addImage(testCategory, img, i, 'alt'));
        await agent
            .post('/login')
            .send(`username=${username}&password=${password}`)
            .set('Content-Type', 'application/x-www-form-urlencoded');
    });

    afterAll(() => {
        deleteCategory(testCategory);
    });

    it('should bulk delete images', async () => {
        const images = getOrderedImages(testCategory);
        const filenames = images.map(img => img.filename);
        const res = await agent
            .post('/bulk-delete-images')
            .send({ category: testCategory, filenames })
            .set('Content-Type', 'application/json');
        expect([200, 302]).toContain(res.statusCode);
        if (res.statusCode === 200) {
            expect(Array.isArray(res.body.deleted)).toBe(true);
            expect(res.body.deleted.length).toBe(filenames.length);
        }
    });
});