# Photo Gallery Admin

A simple Node.js/Express photo gallery with admin panel.

## Setup

1. **Clone the repo**
2. **Install dependencies**
    ```sh
    npm install
    ```
3. **Create a `.env` file** with:
    ```
    SESSION_SECRET=yourrandomsecret
    ```
4. **Run the app**
    ```sh
    npm start
    ```
    or for development with auto-reload:
    ```sh
    npm run dev
    ```

## Usage

- Visit `/admin` to manage images and categories.
- Images are stored in `public/images/<category>`.
- Categories are folders in `public/images`.
- The SQLite database is stored at `data/gallery.db`.

## Environment Variables

- `SESSION_SECRET` – random string for session security

## Folder Structure

- `public/` – static files and images
- `public/images/` – image storage (persisted via Docker volume)
- `data/gallery.db` – SQLite database (persisted via Docker volume)
- `views/` – EJS templates
- `migrations/` – database migration scripts (run automatically)
- `utils.js` – database and helper functions
- `server.js` – main server

## Docker

### Build and Run Locally

```sh
docker build -t photo-gallery .
docker run -p 3000:3000 -v $(pwd)/images:/home/node/app/public/images -v $(pwd)/data:/home/node/app/data -e SESSION_SECRET=yourrandomsecret photo-gallery
```

### Using Docker Compose

1. Edit `docker-compose.yml` and set your `SESSION_SECRET`.
2. Run:
    ```sh
    docker-compose up -d
    ```

### Docker Volumes

- `./images` is mounted to `/home/node/app/public/images` in the container.
- `./data` is mounted to `/home/node/app/data` in the container.

This ensures your images and database persist across container restarts.

## Git & Docker Ignore

- The `images/` and `data/` folders, and `umzug.json` (migration state), are ignored by Git and not included in Docker builds.

## License

MIT