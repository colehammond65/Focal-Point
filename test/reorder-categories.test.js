require('dotenv').config({ path: '.env.test' });
const request = require('supertest');
const app = require('../server');
const { createCategory, deleteCategory } = require('../utils');

describe('Reorder Categories API', () => {
    const agent = request.agent(app);
    const username = process.env.TEST_ADMIN_USER;
    const password = process.env.TEST_ADMIN_PASS;
    const cats = ['cat1', 'cat2', 'cat3'];

    beforeAll(async () => {
        if (app.testAdminReady) {
            await app.testAdminReady;
        }
        cats.forEach(createCategory);
        await agent
            .post('/login')
            .send(`username=${username}&password=${password}`)
            .set('Content-Type', 'application/x-www-form-urlencoded');
    });

    afterAll(() => {
        cats.forEach(deleteCategory);
    });

    it('should reorder categories', async () => {
        const newOrder = [...cats].reverse();
        const res = await agent
            .post('/reorder-categories')
            .send({ order: newOrder })
            .set('Content-Type', 'application/json');
        expect([200, 302]).toContain(res.statusCode);
        if (res.statusCode === 200) {
            expect(res.body.success).toBe(true);
        }
    });
});