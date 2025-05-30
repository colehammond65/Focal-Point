const Database = require('better-sqlite3');
const { Umzug } = require('umzug');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('Created data directory');
}

// Create database connection
const db = new Database(path.join(dataDir, 'gallery.db'));

// Enable foreign keys
db.pragma('foreign_keys = ON');

const migrationsDir = path.join(__dirname, 'migrations');
const migrationFiles = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.js'))
  .sort();

const migrations = migrationFiles.map(filename => ({
  name: filename,
  up: require(path.join(migrationsDir, filename)).up,
  down: require(path.join(migrationsDir, filename)).down,
}));

// Ensure the migrations table exists before querying it
db.prepare('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY)').run();

// Migrate old umzug.json state if present and table is empty
const umzugJsonPath = path.join(__dirname, 'data', 'umzug.json');
const executedMigrations = db.prepare('SELECT name FROM migrations').all();
if (fs.existsSync(umzugJsonPath) && executedMigrations.length === 0) {
  const oldMigrations = JSON.parse(fs.readFileSync(umzugJsonPath, 'utf8'));
  const insert = db.prepare('INSERT OR IGNORE INTO migrations (name) VALUES (?)');
  for (const name of oldMigrations) {
    insert.run(name);
  }
  // Remove the old umzug.json file after migration
  fs.unlinkSync(umzugJsonPath);
}

// Custom storage for Umzug using better-sqlite3
class BetterSqlite3Storage {
  constructor({ db, tableName = 'migrations' }) {
    this.db = db;
    this.tableName = tableName;
    // Table is already created above
  }

  async logMigration({ name }) {
    this.db.prepare(`INSERT OR IGNORE INTO ${this.tableName} (name) VALUES (?)`).run(name);
  }

  async unlogMigration({ name }) {
    this.db.prepare(`DELETE FROM ${this.tableName} WHERE name = ?`).run(name);
  }

  async executed() {
    return this.db.prepare(`SELECT name FROM ${this.tableName}`).all().map(row => row.name);
  }
}

const umzug = new Umzug({
  migrations,
  context: db,
  logger: null, // silence logs during tests
  storage: new BetterSqlite3Storage({ db, tableName: 'migrations' }),
});

const ready = umzug.up();

module.exports = db;
module.exports.ready = ready;