process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';

const fs = require('fs');
const path = require('path');

describe('deployment config', () => {
  test('Docker healthcheck uses healthz endpoint', () => {
    const dockerfile = fs.readFileSync(path.join(__dirname, '..', 'Dockerfile'), 'utf8');
    expect(dockerfile).toContain('/healthz');
  });

  test('Docker workflow does not push images on pull requests', () => {
    const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'docker-image.yml'), 'utf8');
    expect(workflow).toContain("github.event_name == 'push'");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
  });
});