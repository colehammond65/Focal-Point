module.exports = {
    up: async ({ context: db }) => {
        // Add accentColor default if not present
        const exists = db.prepare('SELECT 1 FROM settings WHERE key = ?').get('accentColor');
        if (!exists) {
            db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('accentColor', '#2ecc71');
        }
        console.log("007-add-accent-color migration completed");
    },
    down: async ({ context: db }) => {
        // Remove accentColor setting if exists
        db.prepare('DELETE FROM settings WHERE key = ?').run('accentColor');
    }
};
