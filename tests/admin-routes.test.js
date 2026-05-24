process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';

const path = require('path');
const fs = require('fs');

describe('admin route regressions', () => {
  test('gallery operations reference data/images, not public/images', () => {
    const adminRoutesPath = path.join(__dirname, '..', 'routes', 'admin.js');
    const content = fs.readFileSync(adminRoutesPath, 'utf8');
    expect(content).not.toContain("'../public/images'");
    expect(content).not.toContain('"../public/images"');
  });

  test('restore upload form field matches route expectation', () => {
    const viewPath = path.join(__dirname, '..', 'views', 'admin-settings.ejs');
    const viewContent = fs.readFileSync(viewPath, 'utf8');
    expect(viewContent).toContain('name="backupFile"');
    expect(viewContent).not.toContain('name="backup"');
  });

  test('reorder-images returns JSON response, not redirect', () => {
    const adminRoutesPath = path.join(__dirname, '..', 'routes', 'admin.js');
    const content = fs.readFileSync(adminRoutesPath, 'utf8');
    expect(content).toContain('res.json({ success: true })');
  });

  test('set-thumbnail handler returns JSON response', () => {
    const adminRoutesPath = path.join(__dirname, '..', 'routes', 'admin.js');
    const content = fs.readFileSync(adminRoutesPath, 'utf8');
    expect(content).toContain("router.post('/set-thumbnail'");
    expect(content).toContain('res.json({ success: true })');
  });

  test('header image removal handler awaits getSetting', () => {
    const adminRoutesPath = path.join(__dirname, '..', 'routes', 'admin.js');
    const content = fs.readFileSync(adminRoutesPath, 'utf8');
    expect(content).toContain("router.post('/settings/remove-header-image'");
    expect(content).toMatch(/await getSetting\(/);
  });

  test('restore handler cleans up uploaded file in finally block', () => {
    const adminRoutesPath = path.join(__dirname, '..', 'routes', 'admin.js');
    const content = fs.readFileSync(adminRoutesPath, 'utf8');
    expect(content).toContain("router.post('/restore'");
    expect(content).toContain('finally');
    expect(content).toMatch(/unlink.*req\.file/);
  });
});