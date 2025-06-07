// db.js
// Sets up the SQLite database connection, runs migrations, and exports the db instance.
const Database = require('better-sqlite3');
const { Umzug } = require('umzug');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

let db;
let ready;

// Use a plain object for exports
const exportsObj = {};

(async () => {
  // Ensure data directory exists
  const dataDir = path.join(__dirname, 'data');
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
    console.log('Created data directory');
  }

  // Create database connection
  db = new Database(path.join(dataDir, 'gallery.db'));

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  const migrationsDir = path.join(__dirname, 'migrations');
  let migrationFiles = [];
  try {
    migrationFiles = (await fs.readdir(migrationsDir)).filter(f => f.endsWith('.js')).sort();
  } catch {
    migrationFiles = [];
  }

  // Load migration files for Umzug
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
  let umzugJsonExists = false;
  try {
    await fs.access(umzugJsonPath);
    umzugJsonExists = true;
  } catch { }
  if (umzugJsonExists && executedMigrations.length === 0) {
    const oldMigrations = JSON.parse(await fs.readFile(umzugJsonPath, 'utf8'));
    const insert = db.prepare('INSERT OR IGNORE INTO migrations (name) VALUES (?)');
    for (const name of oldMigrations) {
      insert.run(name);
    }
    // Remove the old umzug.json file after migration
    await fs.unlink(umzugJsonPath);
  }

  // Custom storage for Umzug using better-sqlite3
  class BetterSqlite3Storage {
    constructor({ db, tableName = 'migrations' }) {
      this.db = db;
      this.tableName = tableName;
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
    logger: null,
    storage: new BetterSqlite3Storage({ db, tableName: 'migrations' }),
  });

  // Run all pending migrations on startup
  ready = umzug.up();
  await ready;
  // No direct assignment to exportsObj.db/ready here
})();

// Export property getters for db and ready
Object.defineProperty(exportsObj, 'db', {
  get: () => db,
});
Object.defineProperty(exportsObj, 'ready', {
  get: () => ready,
});

// Add a helper to safely get db after ready
exportsObj.getDb = function getDb() {
  if (!db) throw new Error('Database not initialized yet. Did you await ready?');
  return db;
};

module.exports = exportsObj;

// Re-export the database instance as the default export for backward compatibility
module.exports.default = exportsObj;