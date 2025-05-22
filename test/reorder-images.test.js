require('dotenv').config({ path: '.env.test' });
const request = require('supertest');
const app = require('../server');
const { createCategory, addImage, getOrderedImages, deleteCategory } = require('../utils');

describe('Reorder Images API', () => {
    const agent = request.agent(app);
    const username = process.env.TEST_ADMIN_USER;
    const password = process.env.TEST_ADMIN_PASS;
    const testCategory = 'reorderimgcat';
    const testImages = ['a.jpg', 'b.jpg', 'c.jpg'];

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

    it('should reorder images', async () => {
        // Reverse the order
        const newOrder = [...testImages].reverse();
        const res = await agent
            .post('/reorder-images')
            .send({ category: testCategory, order: JSON.stringify(newOrder) })
            .set('Content-Type', 'application/json');
        expect([200, 302]).toContain(res.statusCode);
    });
});