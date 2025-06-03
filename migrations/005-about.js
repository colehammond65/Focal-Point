module.exports = {
  up: async ({ context: db }) => {
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
    db.exec('DROP TABLE IF EXISTS about;');
  }
};