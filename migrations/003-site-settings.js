module.exports = {
    up: async ({ context: db }) => {
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
    },
    down: async ({ context: db }) => {
        db.exec(`DROP TABLE IF EXISTS settings;`);
    }
};