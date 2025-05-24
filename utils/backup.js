const fs = require('fs');
const path = require('path');

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const BACKUP_LIMIT_BYTES = 500 * 1024 * 1024; // 500 MB

function ensureBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

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

function totalBackupSize() {
    return listBackups().reduce((sum, b) => sum + b.size, 0);
}

function cleanupBackupsForLimit(newFileSize) {
    let backups = listBackups();
    let total = totalBackupSize();
    while (backups.length && total + newFileSize > BACKUP_LIMIT_BYTES) {
        const oldest = backups.shift();
        fs.unlinkSync(oldest.path);
        total -= oldest.size;
    }
}

function saveBackup(buffer, filename) {
    ensureBackupDir();
    cleanupBackupsForLimit(buffer.length);
    const filePath = path.join(BACKUP_DIR, filename);
    fs.writeFileSync(filePath, buffer);
    return filePath;
}

module.exports = {
    BACKUP_DIR,
    BACKUP_LIMIT_BYTES,
    listBackups,
    saveBackup
};