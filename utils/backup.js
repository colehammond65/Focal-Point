/**
 * @fileoverview Backup utility functions for the Focal Point application.
 * 
 * This module handles creating, listing, saving, restoring, and deleting backups 
 * of the database and images. It manages backup directory operations, size limits, 
 * and ZIP archive operations for data protection and recovery.
 * 
 * Features:
 * - Automated ZIP backup creation with database and images
 * - Backup size limit enforcement (500MB default)
 * - Cleanup of old backups when limits exceeded
 * - Bulk operations for multiple backup management
 * - Complete restoration from backup archives
 * 
 * @author Cole Hammond
 * @version 1.0.0
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const archiver = require('archiver');
const unzipper = require('unzipper');

/** @constant {string} Directory path for storing backup files */
const BACKUP_DIR = path.join(__dirname, '..', 'data', 'backups');

/** @constant {number} Maximum total size of all backups in bytes (500MB) */
const BACKUP_LIMIT_BYTES = 500 * 1024 * 1024;

/**
 * Ensures the backup directory exists, creating it if necessary.
 * 
 * @async
 * @function ensureBackupDir
 * @returns {Promise<void>} Resolves when directory exists or is created
 * @throws {Error} If directory creation fails due to permissions or disk space
 */
async function ensureBackupDir() {
    try {
        await fs.mkdir(BACKUP_DIR, { recursive: true });
    } catch (err) {
        if (err.code !== 'EEXIST') throw err;
    }
}

// Lists all backup ZIP files with metadata (name, path, size, mtime)
async function listBackups() {
    await ensureBackupDir();
    const files = await fs.readdir(BACKUP_DIR);
    const backups = await Promise.all(
        files.filter(f => f.endsWith('.zip')).map(async f => {
            const filePath = path.join(BACKUP_DIR, f);
            const stat = await fs.stat(filePath);
            return {
                name: f,
                path: filePath,
                size: stat.size,
                mtime: stat.mtime
            };
        })
    );
    return backups.sort((a, b) => a.mtime - b.mtime); // oldest first
}

// Returns the total size of all backup files
async function totalBackupSize() {
    const backups = await listBackups();
    return backups.reduce((sum, b) => sum + b.size, 0);
}

// Deletes oldest backups to maintain the backup size limit
async function cleanupBackupsForLimit(newFileSize) {
    const backups = await listBackups();
    let total = await totalBackupSize();
    for (const oldest of backups) {
        if (total + newFileSize <= BACKUP_LIMIT_BYTES) break;
        await fs.unlink(oldest.path);
        total -= oldest.size;
    }
}

// Saves a backup buffer to disk, enforcing backup size limits
async function saveBackup(buffer, filename) {
    await ensureBackupDir();
    await cleanupBackupsForLimit(buffer.length);
    const filePath = path.join(BACKUP_DIR, filename);
    await fs.writeFile(filePath, buffer);
    return filePath;
}

// Creates a ZIP backup of the database and images
async function createBackup() {
    await ensureBackupDir();
    const dbPath = path.join(__dirname, '..', 'data', 'gallery.db');
    const imagesDir = path.join(__dirname, '..', 'data', 'images'); // CHANGED from public/images
    const now = new Date();
    const filename = `backup-${now.toISOString().replace(/[:.]/g, '-')}.zip`;
    const filePath = path.join(BACKUP_DIR, filename);
    // Cleanup will be done after the archive is finalized with the actual file size

    return new Promise((resolve, reject) => {
        const output = fsSync.createWriteStream(filePath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        output.on('close', async () => {
            try {
                const stat = await fs.stat(filePath);
                await cleanupBackupsForLimit(stat.size); // Cleanup after archive is finalized
                resolve(filename);
            } catch (err) {
                reject(err);
            }
        });
        output.on('error', err => reject(err));
        archive.on('error', err => reject(err));
        archive.pipe(output);
        archive.file(dbPath, { name: 'gallery.db' });
        archive.directory(imagesDir, 'images'); // CHANGED from public/images
        archive.finalize();
    });
}

// Deletes a specific backup file by filename
async function deleteBackup(filename) {
    if (!/^[\w.-]+\.zip$/.test(filename)) throw new Error('Invalid filename');
    const filePath = path.join(BACKUP_DIR, filename);
    try {
        await fs.unlink(filePath);
        return true;
    } catch {
        return false;
    }
}

// Deletes multiple backups by filename array
async function bulkDeleteBackups(filenames) {
    let deleted = 0;
    for (const filename of filenames) {
        try {
            if (await deleteBackup(filename)) deleted++;
        } catch { }
    }
    return deleted;
}

// Zips and downloads multiple backups as a single archive
async function bulkDownloadBackups(filenames) {
    await ensureBackupDir();
    const archiveName = `backups-bulk-${Date.now()}.zip`;
    const archivePath = path.join(BACKUP_DIR, archiveName);
    const output = fsSync.createWriteStream(archivePath);
    const archive = archiver('zip');
    archive.pipe(output);
    for (const filename of filenames) {
        if (/^[\w.-]+\.zip$/.test(filename)) {
            const filePath = path.join(BACKUP_DIR, filename);
            try {
                await fs.access(filePath);
                archive.file(filePath, { name: filename });
            } catch { }
        }
    }
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
    try {
        await fs.mkdir(extractDir, { recursive: true });
        await new Promise((resolve, reject) => {
            fsSync.createReadStream(backupPath)
                .pipe(unzipper.Extract({ path: extractDir }))
                .on('close', resolve)
                .on('error', reject);
        });
        // Move DB
        const dbSrc = path.join(extractDir, 'gallery.db');
        const dbDest = path.join(__dirname, '..', 'data', 'gallery.db');
        let dbSrcExists = false;
        try { await fs.access(dbSrc); dbSrcExists = true; } catch { }
        if (dbSrcExists) {
            await fs.copyFile(dbSrc, dbDest);
        }
        // Move images
        const imagesSrc = path.join(extractDir, 'images');
        const imagesDest = path.join(__dirname, '..', 'data', 'images'); // CHANGED from public/images
        let imagesSrcExists = false;
        try { await fs.access(imagesSrc); imagesSrcExists = true; } catch { }
        if (imagesSrcExists) {
            // Remove old images first
            let imagesDestExists = false;
            try { await fs.access(imagesDest); imagesDestExists = true; } catch { }
            if (imagesDestExists) await fs.rm(imagesDest, { recursive: true, force: true });
            await fs.rename(imagesSrc, imagesDest);
        }
    } finally {
        let extractDirExists = false;
        try { await fs.access(extractDir); extractDirExists = true; } catch { }
        if (extractDirExists) await fs.rm(extractDir, { recursive: true, force: true });
    }
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
    restoreBackup,
    ensureBackupDir // Exported for completeness
};