# Photo Gallery Admin

A simple Node.js/Express photo gallery with admin panel.

## Setup

1. Clone the repo
2. Run `npm install`
3. Create a `.env` file with:
    ```
    ADMIN_USERNAME=youradmin
    ADMIN_PASSWORD=yourpassword
    SESSION_SECRET=yourrandomsecret
    ```
4. Run `npm start` or `npm run dev`

## Usage

- Visit `/admin` to manage images and categories.
- Images are stored in `public/images/<category>`.
- Categories are folders in `public/images`.

## Environment Variables

- `ADMIN_USERNAME` – admin login username
- `ADMIN_PASSWORD` – admin login password
- `SESSION_SECRET` – random string for session security

## Folder Structure

- `public/` – static files and images
- `views/` – EJS templates
- `utils.js` – file system helpers
- `server.js` – main server

## License

MIT