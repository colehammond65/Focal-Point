// Utility functions for managing site settings in the database.
// Includes functions to get, set, and retrieve all settings.
//
// Exports:
//   - getSetting: Retrieve a setting value by key.
//   - setSetting: Set or update a setting value.
//   - getAllSettings: Retrieve all settings as an object.
//   - getSettingsWithDefaults: Retrieve all settings with defaults.

const { getDb, ready } = require('../db');

async function getSetting(key) {
    await ready;
    const db = getDb();
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
}
async function setSetting(key, value) {
    await ready;
    const db = getDb();
    try {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
        console.log(`[setSetting] Saved: ${key} = ${value}`);
    } catch (err) {
        console.error(`[setSetting] Error saving ${key}:`, err);
        throw err;
    }
}
async function getAllSettings() {
    await ready;
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    rows.forEach(row => settings[row.key] = row.value);
    return settings;
}

async function getSettingsWithDefaults() {
    const settings = await getAllSettings();
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