const request = require('supertest');
const app = require('../server');

describe('Public Routes', () => {
    it('should return 200 or 302 and contain a <title> tag on /', async () => {
        const res = await request(app).get('/');
        expect([200, 302]).toContain(res.statusCode);
        if (res.statusCode === 200) {
            expect(res.text).toMatch(/<title>\s*[\s\S]*?\s*<\/title>/i);
        }
    });

    it('should return 404 or 302 for unknown route', async () => {
        const res = await request(app).get('/not-a-real-page');
        expect([404, 302]).toContain(res.statusCode);
        if (res.statusCode === 404) {
            expect(res.text).toMatch(/404/i);
        }
    });

    it('should show login page or redirect', async () => {
        const res = await request(app).get('/login');
        expect([200, 302]).toContain(res.statusCode);
        if (res.statusCode === 200) {
            expect(res.text).toMatch(/Admin Login/);
        }
    });

    it('should show setup page or redirect if admin exists', async () => {
        const res = await request(app).get('/setup');
        expect([200, 302]).toContain(res.statusCode);
    });
});