// Migration 002: Add 'position' column to categories table
// Adds a position column for ordering categories. No-op for down due to SQLite limitations.
module.exports = {
    up: async ({ context: db }) => {
        // Check if the column already exists
        const columns = db.prepare("PRAGMA table_info(categories)").all();
        const hasPosition = columns.some(col => col.name === 'position');
        if (!hasPosition) {
            // Add the position column
            db.exec(`ALTER TABLE categories ADD COLUMN position INTEGER;`);
            // Set default positions for existing categories
            const cats = db.prepare('SELECT id FROM categories').all();
            cats.forEach((cat, idx) => {
                db.prepare('UPDATE categories SET position = ? WHERE id = ?').run(idx, cat.id);
            });
            console.log("002-add-category-position migration completed");
        } else {
            console.log("'position' column already exists in categories.");
        }
    },
    down: async ({ context: db }) => {
        // SQLite does not support DROP COLUMN, so this is a no-op
        console.log("Down migration for position column is a no-op (SQLite limitation).");
    }
};