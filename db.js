const Database = require('better-sqlite3');
const { Umzug, JSONStorage } = require('umzug');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'data', 'gallery.db');
const db = new Database(dbPath);

const migrationsDir = path.join(__dirname, 'migrations');
const migrationFiles = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.js'))
  .sort();

const migrations = migrationFiles.map(filename => ({
  name: filename,
  up: require(path.join(migrationsDir, filename)).up,
  down: require(path.join(migrationsDir, filename)).down,
}));

const umzug = new Umzug({
  migrations,
  context: db,
  logger: null, // silence logs during tests
  storage: new JSONStorage({ path: path.join(__dirname, 'data', 'umzug.json') }),
});

const ready = umzug.up();

module.exports = db;
module.exports.ready = ready;