module.exports = {
    up: async ({ context: db }) => {
        db.exec(`
            CREATE TABLE IF NOT EXISTS clients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                access_code TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                client_name TEXT NOT NULL,
                shoot_title TEXT,
                expires_at DATETIME NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT 1,
                download_count INTEGER DEFAULT 0,
                last_access DATETIME
            );
        `);

        db.exec(`
            CREATE TABLE IF NOT EXISTS client_images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id INTEGER NOT NULL,
                filename TEXT NOT NULL,
                original_filename TEXT,
                file_size INTEGER,
                uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                download_count INTEGER DEFAULT 0,
                FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE
            );
        `);
        console.log("006-add-client-system migration completed");
    },

    down: async ({ context: db }) => {
        db.exec(`DROP TABLE IF EXISTS client_images;`);
        db.exec(`DROP TABLE IF EXISTS clients;`);
        console.log("Client tables dropped");
    }
};