# Contributing to Focal Point

Thank you for your interest in contributing to Focal Point! This guide will help you get started with contributing to this photography gallery application.

## Table of Contents
- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Contributing Guidelines](#contributing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)
- [Code Style](#code-style)
- [Documentation](#documentation)

## Code of Conduct

This project and everyone participating in it is governed by our commitment to creating a welcoming and inclusive environment. Please be respectful and professional in all interactions.

## Getting Started

### Prerequisites
- Node.js 18+ (recommended: 20+)
- npm or yarn package manager
- Git for version control
- Basic knowledge of Express.js, EJS templating, and SQLite

### First Time Setup

1. **Fork the repository**
   ```bash
   # Fork on GitHub, then clone your fork
   git clone https://github.com/YOUR_USERNAME/Focal-Point.git
   cd Focal-Point
   ```

2. **Add upstream remote**
   ```bash
   git remote add upstream https://github.com/colehammond65/Focal-Point.git
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with development settings
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

## Development Setup

### Project Structure
```
focal-point/
├── server.js              # Main application entry point
├── db.js                  # Database setup and migrations
├── routes/                # Express route handlers
│   ├── admin.js          # Admin panel routes
│   ├── client.js         # Client gallery routes
│   └── main.js           # Public gallery routes
├── utils/                 # Utility modules
│   ├── admin.js          # Admin management functions
│   ├── categories.js     # Gallery category management
│   ├── images.js         # Image processing and management
│   ├── clients.js        # Client delivery management
│   ├── settings.js       # Site settings management
│   └── logger.js         # Winston logging configuration
├── views/                 # EJS templates
├── public/               # Static assets (CSS, JS, images)
├── migrations/           # Database migration scripts
├── __tests__/           # Test suite
└── docs/                # Documentation
```

### Environment Variables
```env
# Required
SESSION_SECRET=your-development-secret-here

# Optional
NODE_ENV=development
PORT=3000
TRUST_PROXY=false
LOG_LEVEL=debug
```

### Database
- **Type**: SQLite (better-sqlite3)
- **Location**: `data/gallery.db` (auto-created)
- **Migrations**: Automatic on startup
- **Reset**: Delete `data/gallery.db` and restart

## Contributing Guidelines

### Types of Contributions

We welcome several types of contributions:

1. **Bug Reports**: Found a bug? Please report it!
2. **Feature Requests**: Have an idea? We'd love to hear it!
3. **Code Contributions**: Bug fixes, new features, improvements
4. **Documentation**: Improve docs, add examples, fix typos
5. **Testing**: Add tests, improve coverage

### Before You Start

1. **Check existing issues** to avoid duplicating work
2. **Create an issue** for significant changes to discuss approach
3. **Keep changes focused** - one feature/fix per PR
4. **Follow coding standards** outlined below

### Branch Strategy

- **main**: Stable, production-ready code
- **feature/feature-name**: New features
- **bugfix/issue-description**: Bug fixes
- **docs/update-description**: Documentation updates

```bash
# Create a feature branch
git checkout -b feature/add-image-filters
git checkout -b bugfix/fix-upload-validation
git checkout -b docs/update-api-docs
```

## Pull Request Process

### Before Submitting

1. **Sync with upstream**
   ```bash
   git fetch upstream
   git checkout main
   git merge upstream/main
   git push origin main
   ```

2. **Rebase your branch**
   ```bash
   git checkout your-feature-branch
   git rebase main
   ```

3. **Run tests and linting**
   ```bash
   npm test
   npm audit
   ```

4. **Update documentation** if needed

### PR Checklist

- [ ] Tests pass locally
- [ ] Code follows style guidelines
- [ ] Documentation updated (if applicable)
- [ ] No security vulnerabilities introduced
- [ ] Commit messages are clear and descriptive
- [ ] PR description explains the changes

### PR Template

When creating a PR, please include:

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Code refactoring

## Testing
- [ ] Existing tests pass
- [ ] New tests added (if applicable)
- [ ] Manual testing completed

## Screenshots (if applicable)
Add screenshots for UI changes

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No breaking changes (or clearly marked)
```

## Testing

### Running Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test __tests__/specific.test.js
```

### Writing Tests

We use Jest for testing. Test files should be placed in `__tests__/` directory:

```javascript
/**
 * @fileoverview Test description
 */

describe('Feature Name', () => {
  beforeEach(() => {
    // Setup before each test
  });

  test('should do something specific', () => {
    // Test implementation
    expect(result).toBe(expected);
  });
});
```

### Test Coverage

- **Utilities**: All public functions should have tests
- **Routes**: Critical paths should be tested
- **Database**: Migration and core queries
- **File Operations**: Upload/download functionality

## Code Style

### JavaScript Style

We follow modern JavaScript best practices:

```javascript
// Use const/let, never var
const config = require('./config');
let result = null;

// Use async/await, not callbacks
async function getUser(id) {
  try {
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return user;
  } catch (error) {
    logger.error('Failed to get user', { id, error });
    throw error;
  }
}

// Use descriptive variable names
const userAuthenticationToken = generateToken();
const isUserAuthenticated = await verifyToken(token);
```

### Documentation Style

All public functions should have JSDoc comments:

```javascript
/**
 * Brief description of the function.
 * 
 * Longer description if needed, explaining the purpose,
 * behavior, and any important implementation details.
 * 
 * @async
 * @function functionName
 * @param {string} param1 - Description of first parameter
 * @param {Object} [options={}] - Optional parameter with default
 * @param {boolean} options.validate - Whether to validate input
 * @returns {Promise<Object>} Description of return value
 * @throws {Error} When validation fails
 * 
 * @example
 * const result = await functionName('input', { validate: true });
 * console.log(result.data);
 */
```

### File Organization

- **Imports**: Node.js built-ins, then npm packages, then local modules
- **Constants**: Declare at the top after imports
- **Functions**: Logical grouping with clear separation
- **Exports**: At the bottom of the file

### Database Queries

- **Always use parameterized queries** to prevent SQL injection
- **Use transactions** for multiple related operations
- **Handle errors gracefully** with proper logging

```javascript
// Good
const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

// Bad - SQL injection risk
const user = db.prepare(`SELECT * FROM users WHERE id = ${userId}`).get();
```

## Documentation

### When to Update Documentation

- **New features**: Update API docs and README
- **Configuration changes**: Update deployment guide
- **Breaking changes**: Update migration guide
- **Bug fixes**: Update troubleshooting if applicable

### Documentation Standards

- **API Documentation**: Keep `docs/API.md` current
- **Deployment**: Update `docs/DEPLOYMENT.md` for infrastructure changes
- **README**: Keep feature list and quick start guide current
- **Code Comments**: Explain complex logic and business rules

### Writing Good Documentation

1. **Be Clear**: Use simple, direct language
2. **Provide Examples**: Show actual usage
3. **Keep Current**: Update docs with code changes
4. **Test Examples**: Ensure code examples work

## Release Process

### Versioning

We follow [Semantic Versioning](https://semver.org/):
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Release Checklist

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Ensure all tests pass
4. Update documentation
5. Create release PR
6. Tag release after merge

## Getting Help

### Resources

- **Documentation**: Check `docs/` directory
- **Issues**: Search existing GitHub issues
- **Discussions**: Use GitHub Discussions for questions

### Asking for Help

When asking for help, please include:
- **Environment details** (Node.js version, OS)
- **Steps to reproduce** the issue
- **Expected vs actual behavior**
- **Relevant logs** or error messages
- **Code samples** (if applicable)

### Contact

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and general discussion
- **Email**: For security issues or private matters

## Recognition

Contributors are recognized in:
- **GitHub Contributors** section
- **Release notes** for significant contributions
- **Documentation** for major feature additions

Thank you for contributing to Focal Point! Your help makes this project better for photographers everywhere.