// Utility functions for managing site settings in the database.
// Includes functions to get, set, and retrieve all settings.
//
// Exports:
//   - getSetting: Retrieve a setting value by key.
//   - setSetting: Set or update a setting value.
//   - getAllSettings: Retrieve all settings as an object.
//   - getSettingsWithDefaults: Retrieve all settings with defaults.

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

function getSettingsWithDefaults() {
    const settings = getAllSettings();
    settings.siteTitle = settings.siteTitle || 'Focal Point';
    settings.headerTitle = settings.headerTitle || 'Focal Point';
    settings.favicon = typeof settings.favicon === 'string' ? settings.favicon : '';
    settings.accentColor = settings.accentColor || '#2ecc71';
    settings.headerType = settings.headerType || 'text';
    settings.headerImage = typeof settings.headerImage === 'string' ? settings.headerImage : '';
    return settings;
}

module.exports = {
    getSetting,
    setSetting,
    getAllSettings,
    getSettingsWithDefaults
};