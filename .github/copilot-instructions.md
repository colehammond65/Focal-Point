# GitHub Copilot Instructions File for Focal-Point

project:
  name: Focal-Point
  description: |
    Focal-Point is a Node.js and Express-based photo gallery application for photography freelancers.
    It supports user authentication, photo uploads, gallery and client management, and elegant photo presentation.
    The app uses EJS for views, CSS for styling, and stores data in a SQLite database using better-sqlite3.

context:
  - Backend follows RESTful API conventions, with organized routes for galleries, photos, users, and admin.
  - Key models/entities: admin user, gallery categories, images, clients.
  - Uploaded photos are stored in the filesystem under public/images/; metadata is stored in SQLite.
  - Authentication is session-based (not JWT) using express-session.
  - EJS templates for dynamic HTML rendering; no client-side JS frameworks.
  - Project uses migrations for DB schema in migrations/ (via Umzug).
  - Uses dotenv for environment configuration (SESSION_SECRET, etc).
  - The data/ folder holds SQLite data and migration status.

coding_standards:
  - Use async/await for all asynchronous code.
  - Use camelCase for JS variables, functions, and properties.
  - Use PascalCase for classes and constructor functions.
  - Prefer const and let over var.
  - Controllers should be thin; logic goes in services/helpers (e.g., utils/).
  - Use clear, descriptive comments for non-obvious code.
  - EJS templates should be modular and logic-light.
  - CSS should be organized by feature or page.
  - Everything should be up to date with the latest Node.js and Express best practices.
  - All user data should be stored in the data folder

libraries:
  - express
  - ejs
  - multer (for photo uploads)
  - better-sqlite3 (for DB access)
  - dotenv
  - express-session
  - bcryptjs (for password hashing)
  - umzug (for migrations)
  - supertest (for testing)

environment:
  - Use dotenv for secrets and configuration.
  - Do not hardcode sensitive data.

dos_and_donts:
  dos:
    - Write modular, testable code.
    - Validate and sanitize all user input and file uploads.
    - Handle errors gracefully and log useful debugging info.
    - Use Express Router to modularize routes.
    - Ensure all SQLite queries are parameterized.
    - Use appropriate HTTP status codes.
    - Organize static assets in the public directory.
    - Use EJS for server-side rendering of HTML.
    - Use CSS for styling; keep it in public/stylesheets.
    - Use migrations for database schema changes.
    - Use bcryptjs for password hashing.
    - Use express-session for session management.
    - Write unit tests for critical functionality using supertest.
    - Use async/await for all asynchronous operations.
    - Use better-sqlite3 for database operations.
    - Use multer for handling file uploads.
    - Use Umzug for managing database migrations.
    - Use dotenv for environment variables.
    - Use clear, descriptive comments in code.
    - Use consistent naming conventions across the codebase.
    - If I ask to change something that would go against these guidelines, don't do it and explain why.
    - Store all user data in the data folder.

  donts:
    - Do not use deprecated Node.js or Express APIs.
    - Do not generate code for front-end frameworks (React, Vue, etc).
    - Do not use inline CSS or JS in EJS templates.
    - Do not expose sensitive data in logs.
    - Do not use any database except SQLite (via better-sqlite3).
    - Do not implement JWT or OAuth authentication.
    - Do not modify exsisting database migrations, make new ones instead.
    - Do not have user data outside the data folder.

examples:
  - "Create a new category": "Add a POST /admin/categories route to accept a name and create a new category in SQLite."
  - "Upload a photo": "Add a POST /admin/images route using multer to handle image upload, save metadata in SQLite, and store the file in public/images."
  - "User authentication": "Use express-session to manage logins and bcryptjs for password hashing. Store the session in-memory."
# End of Copilot instructions file.
