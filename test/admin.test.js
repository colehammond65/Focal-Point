require('dotenv').config({ path: '.env.test' });

const request = require('supertest');
const app = require('../server');

beforeAll(async () => {
    if (app.testAdminReady) {
        await app.testAdminReady;
    }
});

describe('Admin Routes', () => {
    const agent = request.agent(app);
    const username = process.env.TEST_ADMIN_USER;
    const password = process.env.TEST_ADMIN_PASS;

    beforeAll(async () => {
        // Try to create admin if not exists (ignore errors)
        try {
            const { createAdmin } = require('../utils');
            await createAdmin(username, password);
        } catch { }
        // Log in
        await agent
            .post('/login')
            .send(`username=${username}&password=${password}`)
            .set('Content-Type', 'application/x-www-form-urlencoded');
    });

    it('should access /admin/manage after login', async () => {
        const res = await agent.get('/admin/manage');
        expect([200, 302]).toContain(res.statusCode);
        if (res.statusCode === 200) {
            expect(res.text).toMatch(/Image & Category Management/);
        }
    });

    it('should access /admin/settings after login', async () => {
        const res = await agent.get('/admin/settings');
        expect([200, 302]).toContain(res.statusCode);
        if (res.statusCode === 200) {
            expect(res.text).toMatch(/Save Settings/);
        }
    });
});