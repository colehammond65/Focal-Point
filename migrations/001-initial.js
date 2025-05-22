module.exports = {
    up: async ({ context: db }) => {
        db.exec(`
      CREATE TABLE IF NOT EXISTS admin (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        hash TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      );
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
    },
    down: async ({ context: db }) => {
        db.exec(`DROP TABLE IF EXISTS images;`);
        db.exec(`DROP TABLE IF EXISTS categories;`);
        db.exec(`DROP TABLE IF EXISTS admin;`);
    }
};