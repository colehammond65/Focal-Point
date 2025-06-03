// Migration 001: Initial database schema setup
// Creates admin, categories, and images tables for the application.
// The 'up' function applies the migration, the 'down' function reverts it.
module.exports = {
  up: async ({ context: db }) => {
    // Create admin table for storing admin user credentials
    db.exec(`
            CREATE TABLE IF NOT EXISTS admin (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                hash TEXT NOT NULL
            );
        `);
    console.log("Admin table created");
    // Create categories table for image categories
    db.exec(`
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE
            );
        `);
    console.log("Categories table created");
    // Create images table for storing image metadata
    db.exec(`
            CREATE TABLE IF NOT EXISTS images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category_id INTEGER NOT NULL,
                filename TEXT NOT NULL,
                position INTEGER NOT NULL,
                is_thumbnail INTEGER DEFAULT 0,
                alt_text TEXT DEFAULT '',
                FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
            );
        `);
    console.log("001-initial migration completed");
  },
  down: async ({ context: db }) => {
    // Drop tables in reverse order for rollback
    db.exec(`DROP TABLE IF EXISTS images;`);
    db.exec(`DROP TABLE IF EXISTS categories;`);
    db.exec(`DROP TABLE IF EXISTS admin;`);
  }
};