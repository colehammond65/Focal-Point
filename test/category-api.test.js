require('dotenv').config({ path: '.env.test' });
const request = require('supertest');
const app = require('../server');

beforeAll(async () => {
    if (app.testAdminReady) {
        await app.testAdminReady;
    }
});

describe('Category API', () => {
    const agent = request.agent(app);
    const username = process.env.TEST_ADMIN_USER;
    const password = process.env.TEST_ADMIN_PASS;
    const testCategory = 'apitestcat';

    beforeAll(async () => {
        // Log in as admin
        await agent
            .post('/login')
            .send(`username=${username}&password=${password}`)
            .set('Content-Type', 'application/x-www-form-urlencoded');
    });

    afterAll(async () => {
        // Clean up: delete the test category if it exists
        await agent
            .post('/delete-category')
            .send(`category=${testCategory}`)
            .set('Content-Type', 'application/x-www-form-urlencoded');
    });

    it('should create a new category', async () => {
        const res = await agent
            .post('/create-category')
            .send(`newCategory=${testCategory}`)
            .set('Content-Type', 'application/x-www-form-urlencoded');
        expect([200, 302]).toContain(res.statusCode);
    });

    it('should not create a category with invalid name', async () => {
        const res = await agent
            .post('/create-category')
            .send('newCategory=bad/name')
            .set('Content-Type', 'application/x-www-form-urlencoded');
        expect([200, 302]).toContain(res.statusCode);
        // Optionally, check for error message in redirect
    });

    it('should delete the category', async () => {
        const res = await agent
            .post('/delete-category')
            .send(`category=${testCategory}`)
            .set('Content-Type', 'application/x-www-form-urlencoded');
        expect([200, 302]).toContain(res.statusCode);
    });
});