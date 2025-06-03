// Migration 003: Add site settings table
// Creates a settings table for storing key-value site settings and inserts defaults.
module.exports = {
    up: async ({ context: db }) => {
        // Create settings table if it doesn't exist
        db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
        // Set defaults if not present
        const defaults = [
            { key: 'siteTitle', value: "Focal Point " },
            { key: 'headerTitle', value: "Focal Point " },
            { key: 'favicon', value: "" }
        ];
        defaults.forEach(({ key, value }) => {
            db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(key, value);
        });
        console.log("003-site-settings migration completed");
    },
    down: async ({ context: db }) => {
        // Drop settings table for rollback
        db.exec(`DROP TABLE IF EXISTS settings;`);
    }
};