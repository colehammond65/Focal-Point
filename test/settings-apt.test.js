require('dotenv').config({ path: '.env.test' });
const request = require('supertest');
const app = require('../server');

beforeAll(async () => {
    if (app.testAdminReady) {
        await app.testAdminReady;
    }
});

describe('Settings API', () => {
    const agent = request.agent(app);
    const username = process.env.TEST_ADMIN_USER;
    const password = process.env.TEST_ADMIN_PASS;

    beforeAll(async () => {
        await agent
            .post('/login')
            .send(`username=${username}&password=${password}`)
            .set('Content-Type', 'application/x-www-form-urlencoded');
    });

    it('should update site settings', async () => {
        const res = await agent
            .post('/admin/settings')
            .field('siteTitle', 'Test Site Title')
            .field('headerTitle', 'Test Header Title');
        expect([200, 302]).toContain(res.statusCode);
    });
});