const Database = require('better-sqlite3');
const { Umzug, migrationsList } = require('umzug');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'gallery.db');
const db = new Database(dbPath);

const umzug = new Umzug({
  migrations: migrationsList(require('fs')
    .readdirSync(path.join(__dirname, 'migrations'))
    .filter(f => f.endsWith('.js'))
    .map(f => require(path.join(__dirname, 'migrations', f)))
  ),
  context: db,
  logger: console,
});

(async () => {
  await umzug.up();
})();

module.exports = db;