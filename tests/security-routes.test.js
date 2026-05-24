process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';

const fs = require('fs');
const path = require('path');
const request = require('supertest');

const app = require('../server');
const { ready, getDb } = require('../db');

describe('security route regressions', () => {
  beforeAll(async () => {
    await ready;
    fs.mkdirSync(path.join(__dirname, '..', 'data', 'client-uploads', '1'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, '..', 'data', 'client-uploads', '1', 'private.jpg'), 'not-real-jpg');
  });

  test('does not expose gallery database through branding route', async () => {
    await request(app).get('/branding/gallery.db').expect(404);
  });

  test('does not expose backups through branding route', async () => {
    fs.mkdirSync(path.join(__dirname, '..', 'data', 'backups'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, '..', 'data', 'backups', 'backup-test.zip'), 'zip');

    await request(app).get('/branding/backups/backup-test.zip').expect(404);
  });

  test('does not expose client uploads without client session', async () => {
    await request(app).get('/client-images/1/private.jpg').expect(302);
    await request(app).get('/uploads/1/private.jpg').expect(404);
    await request(app).get('/branding/client-uploads/1/private.jpg').expect(404);
  });
});