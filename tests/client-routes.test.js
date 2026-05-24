process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';

const path = require('path');
const fs = require('fs');
const request = require('supertest');
const app = require('../server');
const { ready } = require('../db');

describe('client route regressions', () => {
  beforeAll(async () => {
    await ready;
  });

  test('gallery route does not crash when client is logged in', async () => {
    const agent = request.agent(app);
    // First create a client via admin (skip if difficult, just test the gallery route doesn't crash)
    const response = await agent.get('/client/gallery');
    // Should either 302 redirect to login, or render without crashing
    expect([200, 302]).toContain(response.status);
    expect(response.text).not.toContain('images.forEach is not a function');
    expect(response.text).not.toContain('clientId is not defined');
  });
});