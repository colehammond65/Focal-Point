module.exports = function notFoundPage(siteTitle = "Photo Gallery") {
  return `
    <html>
      <head>
        <title>404 Not Found | ${siteTitle}</title>
        <link rel="stylesheet" href="/styles.css">
        <style>
          body { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; background: #f7f8fa; }
          .notfound-container { text-align: center; padding: 3rem 2rem; background: #fff; border-radius: 0.5rem; box-shadow: 0 2px 16px rgba(0,0,0,0.07);}
          .notfound-container h1 { font-size: 3rem; margin-bottom: 1rem; }
          .notfound-container p { font-size: 1.2rem; margin-bottom: 2rem; }
          .notfound-container a { background: #222; color: #fff; padding: 0.7rem 1.5rem; border-radius: 0.3rem; text-decoration: none; font-weight: 600; }
          .notfound-container a:hover { background: #444; }
        </style>
      </head>
      <body>
        <div class="notfound-container">
          <h1>404</h1>
          <p>Sorry, the page you requested could not be found.</p>
          <a href="/">Back to Home</a>
        </div>
      </body>
    </html>
  `;
};