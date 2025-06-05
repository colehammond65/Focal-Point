// utils/about.js
// Utility functions for About page management

const { getDb, ready } = require('../db');

async function getAbout() {
    await ready;
    const db = getDb();
    return db.prepare('SELECT * FROM about LIMIT 1').get();
}

async function updateAbout(markdown, imagePath = null) {
    await ready;
    const db = getDb();
    if (imagePath !== null) {
        db.prepare('UPDATE about SET markdown = ?, image_path = ? WHERE id = 1').run(markdown, imagePath);
    } else {
        db.prepare('UPDATE about SET markdown = ? WHERE id = 1').run(markdown);
    }
}

async function updateAboutImage(imagePath) {
    await ready;
    const db = getDb();
    db.prepare('UPDATE about SET image_path = ? WHERE id = 1').run(imagePath);
}

async function deleteAboutImage() {
    await ready;
    const db = getDb();
    db.prepare('UPDATE about SET image_path = NULL WHERE id = 1').run();
}

module.exports = {
    getAbout,
    updateAbout,
    updateAboutImage,
    deleteAboutImage
};
