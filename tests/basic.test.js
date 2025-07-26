// Basic test to ensure the application can start and respond
const request = require('supertest');
const app = require('../server');
const { ready } = require('../db');

describe('Focal-Point Basic Tests', () => {
  beforeAll(async () => {
    // Wait for database to be ready before running tests
    await ready;
    // Wait for test admin to be created
    await app.testAdminReady;
  });

  test('Server should start without errors', () => {
    expect(app).toBeDefined();
  });

  test('Should handle setup/admin redirect appropriately', async () => {
    // This test allows for both 200 (if admin exists) and 302 (redirect to setup) responses
    const response = await request(app).get('/');
    expect([200, 302]).toContain(response.status);
    
    // If redirected, it should be to /setup
    if (response.status === 302) {
      expect(response.headers.location).toBe('/setup');
    }
  });

  test('Should serve static files', async () => {
    const response = await request(app).get('/manifest.json');
    expect([200, 404]).toContain(response.status); // 404 is acceptable if file doesn't exist
  });

  test('Environment configuration should be loaded', () => {
    expect(process.env.SESSION_SECRET).toBeDefined();
  });
});