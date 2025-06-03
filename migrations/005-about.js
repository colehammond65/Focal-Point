// Migration 005: Add about table
// Creates an about table for storing site/about page content and image.
module.exports = {
  up: async ({ context: db }) => {
    // Create about table if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS about (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        markdown TEXT NOT NULL,
        image_path TEXT
      );
    `);
    // Insert a default row if not exists
    const row = db.prepare('SELECT 1 FROM about LIMIT 1').get();
    if (!row) {
      db.prepare('INSERT INTO about (markdown, image_path) VALUES (?, ?)').run(
        '# About Me\n\nWrite something about yourself here!',
        null
      );
    }
    console.log("005-about migration completed");
  },
  down: async ({ context: db }) => {
    // Drop about table for rollback
    db.exec('DROP TABLE IF EXISTS about;');
  }
};