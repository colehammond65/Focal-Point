// utils/imageUtils.js
// Utility functions for stripping EXIF/metadata from images
// Used for uploads and bulk migration of existing images

const sharp = require('sharp');
const fsSync = require('fs');
const fsAsync = require('fs').promises;
const path = require('path');
const archiver = require('archiver');

const BACKUP_DIR = path.join(__dirname, '../data/image-backups');

async function stripMetadata(inputPath, outputPath) {
    await sharp(inputPath).withMetadata(false).toFile(outputPath);
}

async function stripMetadataInPlace(filePath) {
    const tmpPath = filePath + '.tmp';
    await sharp(filePath).withMetadata(false).toFile(tmpPath);
    await fsAsync.rename(tmpPath, filePath);
}

async function migrateDirectory(dir, progressCallback = null) {
    let processed = 0;
    let errors = 0;
    const files = await getImageFiles(dir);
    const total = files.length;

    for (const file of files) {
        try {
            await stripMetadataInPlace(file);
            processed++;
        } catch (err) {
            errors++;
            console.error(`[imageUtils] Failed to strip metadata from ${file}: ${err.message}`);
        }
        if (progressCallback) progressCallback(processed, total, file);
    }

    return { processed, errors, total };
}

async function getImageFiles(dir) {
    const images = [];
    try {
        const entries = await fsAsync.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                images.push(...await getImageFiles(fullPath));
            } else if (isImageFile(entry.name)) {
                images.push(fullPath);
            }
        }
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.error(`[imageUtils] Error reading directory ${dir}: ${err.message}`);
        }
    }
    return images;
}

function isImageFile(filename) {
    const ext = path.extname(filename).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.bmp'].includes(ext);
}

async function backupImages() {
    await fsAsync.mkdir(BACKUP_DIR, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `metadata-migration-${timestamp}.zip`;
    const backupPath = path.join(BACKUP_DIR, backupName);

    return new Promise((resolve, reject) => {
        const output = fsSync.createWriteStream(backupPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => resolve(backupPath));
        archive.on('error', reject);

        archive.pipe(output);

        const galleryDir = path.join(__dirname, '../data/images');
        const clientDir = path.join(__dirname, '../data/client-uploads');

        if (fsSync.existsSync(galleryDir)) {
            archive.directory(galleryDir, 'images');
        }
        if (fsSync.existsSync(clientDir)) {
            archive.directory(clientDir, 'client-uploads');
        }

        archive.finalize();
    });
}

module.exports = {
    stripMetadata,
    stripMetadataInPlace,
    migrateDirectory,
    getImageFiles,
    isImageFile,
    backupImages,
    BACKUP_DIR
};