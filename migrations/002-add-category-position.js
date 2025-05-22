module.exports = {
    up: async ({ context: db }) => {
        // Add the position column if it doesn't exist
        db.exec(`ALTER TABLE categories ADD COLUMN position INTEGER;`);
        // Set default positions for existing categories
        const cats = db.prepare('SELECT id FROM categories').all();
        cats.forEach((cat, idx) => {
            db.prepare('UPDATE categories SET position = ? WHERE id = ?').run(idx, cat.id);
        });
        console.log("Added 'position' column to categories and initialized values.");
    },
    down: async ({ context: db }) => {
        // SQLite does not support DROP COLUMN, so this is a no-op
        console.log("Down migration for position column is a no-op (SQLite limitation).");
    }
};