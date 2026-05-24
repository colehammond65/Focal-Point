process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';

const fs = require('fs');
const path = require('path');
const request = require('supertest');

const app = require('../server');
const { ready, getDb } = require('../db');
const { adminExists, createAdmin } = require('../utils');

describe('security route regressions', () => {
  beforeAll(async () => {
    await ready;
    await new Promise(r => setTimeout(r, 200));
    if (!(await adminExists())) {
      await createAdmin('testadmin', 'testpassword123');
    }
    fs.mkdirSync(path.join(__dirname, '..', 'data', 'client-uploads', '1'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, '..', 'data', 'client-uploads', '1', 'private.jpg'), 'not-real-jpg');
    fs.mkdirSync(path.join(__dirname, '..', 'data', 'backups'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, '..', 'data', 'backups', 'backup-test.zip'), 'zip');
  });

  afterAll(() => {
    fs.rmSync(path.join(__dirname, '..', 'data', 'client-uploads', '1', 'private.jpg'), { force: true });
    fs.rmSync(path.join(__dirname, '..', 'data', 'backups', 'backup-test.zip'), { force: true });
    fs.rmSync(path.join(__dirname, '..', 'data', 'client-uploads', '1'), { force: true, recursive: true });
    fs.rmSync(path.join(__dirname, '..', 'data', 'backups'), { force: true, recursive: true });
  });

  test('does not expose gallery database through branding route', async () => {
    await request(app).get('/branding/gallery.db').expect(404);
  });

  test('does not expose backups through branding route', async () => {
    await request(app).get('/branding/backups/backup-test.zip').expect(404);
  });

  test('does not expose client uploads without client session', async () => {
    await request(app).get('/client-images/1/private.jpg').expect(404);
    await request(app).get('/uploads/1/private.jpg').expect(404);
    await request(app).get('/branding/client-uploads/1/private.jpg').expect(404);
  });

  test('does not serve files outside branding directory via traversal', async () => {
    await request(app).get('/branding/..%2F..%2Fgallery.db').expect(400);
    await request(app).get('/branding/..%2F..%2Fdata%2Fgallery.db').expect(400);
  });

  test('rejects invalid client login credentials', async () => {
    const response = await request(app)
      .post('/client/login')
      .type('form')
      .send({ accessCode: 'BADCODE', password: 'wrong-password' });

    expect(response.status).toBe(200);
    expect(response.text).toContain('Invalid access code or password');
  });

  test('about page strips raw scriptable html from markdown', async () => {
    const { getDb } = require('../db');
    await ready;
    const db = getDb();
    db.prepare('INSERT OR REPLACE INTO about (id, markdown, image_path) VALUES (1, ?, NULL)')
      .run('<img src=x onerror="alert(1)"><script>alert(2)</script>');

    const response = await request(app).get('/about').expect(200);
    expect(response.text).not.toContain('onerror');
    expect(response.text).not.toContain('<script>alert(2)</script>');
  });
});