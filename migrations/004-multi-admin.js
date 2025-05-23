module.exports = {
    up: async ({ context: db }) => {
        // Add id column and unique constraint if not present
        db.exec(`
      CREATE TABLE IF NOT EXISTS admin (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        hash TEXT NOT NULL
      );
    `);
        // If you need to migrate data from an old single-admin table, do it here.
    },
    down: async ({ context: db }) => {
        // No-op or drop the admin table if you want to support rollback
        // db.exec('DROP TABLE IF EXISTS admin;');
    }
};