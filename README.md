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
    TRUST_PROXY=false
    ```
    - `SESSION_SECRET` is required for session security.
    - `TRUST_PROXY` controls Express's trust proxy setting (see below).
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
- The SQLite database and migration state are stored in `data/` (`gallery.db`, `umzug.json`).

## Environment Variables

- `SESSION_SECRET` – random string for session security (**required**)
- `TRUST_PROXY` – set to `1`, `true`, or `false` to control Express's trust proxy setting (default: `false`)
    - Set to `1` if running behind a reverse proxy or tunnel (e.g., Cloudflare Tunnel, Nginx, etc.)

## Folder Structure

- `public/` – static files and images
- `public/images/` – image storage (persisted via Docker volume)
- `data/gallery.db` – SQLite database (persisted via Docker volume)
- `data/umzug.json` – migration state (persisted via Docker volume)
- `views/` – EJS templates
- `migrations/` – database migration scripts (run automatically)
- `utils.js` – database and helper functions
- `server.js` – main server

## Docker

### Build and Run Locally

```sh
docker build -t photo-gallery .
docker run -p 3000:3000 \
  -v $(pwd)/images:/home/node/app/public/images \
  -v $(pwd)/data:/home/node/app/data \
  -e SESSION_SECRET=yourrandomsecret \
  -e TRUST_PROXY=1 \
  photo-gallery
```

### Using Docker Compose

1. Edit `docker-compose.yml` and set your `SESSION_SECRET` and `TRUST_PROXY` as needed.
2. Run:
    ```sh
    docker-compose up -d
    ```

### Docker Volumes

- `./images` is mounted to `/home/node/app/public/images` in the container.
- `./data` is mounted to `/home/node/app/data` in the container.

This ensures your images, database, and migration state persist across container restarts.

## Git & Docker Ignore

- The `images/` and `data/` folders, and `umzug.json` (migration state), are ignored by Git and not included in Docker builds.

## Security Notes

- **Do not serve the entire `data/` folder as static content.** Only serve `public/` and its subfolders.
- Always set a strong, random `SESSION_SECRET`.
- Set `TRUST_PROXY=1` if running behind a proxy or tunnel.

## License

MIT