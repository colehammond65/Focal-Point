// utils/backup.js
// Utility functions for creating, listing, saving, restoring, and deleting backups of the database and images.
// Handles backup directory management, backup size limits, and ZIP archive operations.
//
// Exports:
//   - ensureBackupDir: Ensures the backup directory exists.
//   - listBackups: Lists all backup ZIP files with metadata.
//   - totalBackupSize: Returns the total size of all backups.
//   - cleanupBackupsForLimit: Deletes oldest backups to maintain size limit.
//   - saveBackup: Saves a backup buffer to disk, enforcing size limits.
//   - createBackup: Creates a ZIP backup of the database and images.
//   - deleteBackup: Deletes a specific backup file.
//   - bulkDeleteBackups: Deletes multiple backups.
//   - bulkDownloadBackups: Zips and downloads multiple backups.
//   - restoreBackup: Restores a backup from a ZIP file.

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const unzipper = require('unzipper');

const BACKUP_DIR = path.join(__dirname, '..', 'data', 'backups');
const BACKUP_LIMIT_BYTES = 500 * 1024 * 1024; // 500 MB

// Ensures the backup directory exists
function ensureBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Lists all backup ZIP files with metadata (name, path, size, mtime)
function listBackups() {
    ensureBackupDir();
    return fs.readdirSync(BACKUP_DIR)
        .filter(f => f.endsWith('.zip'))
        .map(f => {
            const filePath = path.join(BACKUP_DIR, f);
            return {
                name: f,
                path: filePath,
                size: fs.statSync(filePath).size,
                mtime: fs.statSync(filePath).mtime
            };
        })
        .sort((a, b) => a.mtime - b.mtime); // oldest first
}

// Returns the total size of all backup files
function totalBackupSize() {
    return listBackups().reduce((sum, b) => sum + b.size, 0);
}

// Deletes oldest backups to maintain the backup size limit
async function cleanupBackupsForLimit(newFileSize) {
    const backups = listBackups();
    let total = totalBackupSize();
    for (const oldest of backups) {
        if (total + newFileSize <= BACKUP_LIMIT_BYTES) break;
        await fs.promises.unlink(oldest.path);
        total -= oldest.size;
    }
}

// Saves a backup buffer to disk, enforcing backup size limits
async function saveBackup(buffer, filename) {
    ensureBackupDir();
    await cleanupBackupsForLimit(buffer.length);
    const filePath = path.join(BACKUP_DIR, filename);
    await fs.promises.writeFile(filePath, buffer);
    return filePath;
}

// Creates a ZIP backup of the database and images
async function createBackup() {
    ensureBackupDir();
    const dbPath = path.join(__dirname, '..', 'data', 'gallery.db');
    const imagesDir = path.join(__dirname, '..', 'public', 'images');
    const now = new Date();
    const filename = `backup-${now.toISOString().replace(/[:.]/g, '-')}.zip`;
    const filePath = path.join(BACKUP_DIR, filename);
    // Cleanup will be done after the archive is finalized with the actual file size

    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(filePath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        output.on('close', async () => {
            const newFileSize = fs.statSync(filePath).size;
            await cleanupBackupsForLimit(newFileSize); // Cleanup after archive is finalized
            resolve(filename);
        });
        output.on('error', err => reject(err));
        archive.on('error', err => reject(err));
        archive.pipe(output);
        archive.file(dbPath, { name: 'gallery.db' });
        archive.directory(imagesDir, 'images');
        archive.finalize();
    });
}

// Deletes a specific backup file by filename
function deleteBackup(filename) {
    if (!/^[\w.-]+\.zip$/.test(filename)) throw new Error('Invalid filename');
    const filePath = path.join(BACKUP_DIR, filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
    }
    return false;
}

// Deletes multiple backups by filename array
function bulkDeleteBackups(filenames) {
    let deleted = 0;
    filenames.forEach(filename => {
        try {
            if (deleteBackup(filename)) deleted++;
        } catch { }
    });
    return deleted;
}

// Zips and downloads multiple backups as a single archive
async function bulkDownloadBackups(filenames) {
    ensureBackupDir();
    const archiveName = `backups-bulk-${Date.now()}.zip`;
    const archivePath = path.join(BACKUP_DIR, archiveName);
    const output = fs.createWriteStream(archivePath);
    const archive = archiver('zip');
    archive.pipe(output);
    filenames.forEach(filename => {
        if (/^[\w.-]+\.zip$/.test(filename)) {
            const filePath = path.join(BACKUP_DIR, filename);
            if (fs.existsSync(filePath)) {
                archive.file(filePath, { name: filename });
            }
        }
    });
    await archive.finalize();
    return new Promise((resolve, reject) => {
        output.on('close', () => resolve({ archivePath, archiveName }));
        archive.on('error', err => reject(err));
    });
}

// Restores a backup from a ZIP file, overwriting gallery.db and images
async function restoreBackup(backupPath) {
    // Overwrite gallery.db and images from the zip
    const extractDir = path.join(__dirname, '..', 'data', 'tmp-restore');
    if (!fs.existsSync(extractDir)) fs.mkdirSync(extractDir, { recursive: true });
    await fs.createReadStream(backupPath)
        .pipe(unzipper.Extract({ path: extractDir }))
        .promise();
    // Move DB
    const dbSrc = path.join(extractDir, 'gallery.db');
    const dbDest = path.join(__dirname, '..', 'data', 'gallery.db');
    if (fs.existsSync(dbSrc)) {
        fs.copyFileSync(dbSrc, dbDest);
    }
    // Move images
    const imagesSrc = path.join(extractDir, 'images');
    const imagesDest = path.join(__dirname, '..', 'public', 'images');
    if (fs.existsSync(imagesSrc)) {
        // Remove old images first
        if (fs.existsSync(imagesDest)) fs.rmSync(imagesDest, { recursive: true, force: true });
        fs.renameSync(imagesSrc, imagesDest);
    }
    // Clean up
    fs.rmSync(extractDir, { recursive: true, force: true });
}

module.exports = {
    BACKUP_DIR,
    BACKUP_LIMIT_BYTES,
    listBackups,
    saveBackup,
    createBackup,
    deleteBackup,
    bulkDeleteBackups,
    bulkDownloadBackups,
    restoreBackup
};