// Utility functions for managing site settings in the database.
// Includes functions to get, set, and retrieve all settings.
//
// Exports:
//   - getSetting: Retrieve a setting value by key.
//   - setSetting: Set or update a setting value.
//   - getAllSettings: Retrieve all settings as an object.

const db = require('../db');

function getSetting(key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
}
function setSetting(key, value) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}
function getAllSettings() {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    rows.forEach(row => settings[row.key] = row.value);
    return settings;
}

module.exports = {
    getSetting,
    setSetting,
    getAllSettings
};