const Database = require('better-sqlite3');
const { Umzug } = require('umzug');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'data', 'gallery.db');
const db = new Database(dbPath);

// Load all migration modules from the migrations folder
const migrationsDir = path.join(__dirname, 'migrations');
const migrationFiles = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.js'))
  .sort();

const migrations = migrationFiles.map(filename => {
  return {
    name: filename,
    up: require(path.join(migrationsDir, filename)).up,
    down: require(path.join(migrationsDir, filename)).down,
  };
});

const umzug = new Umzug({
  migrations,
  context: db,
  logger: console,
});

(async () => {
  await umzug.up();
})();

module.exports = db;