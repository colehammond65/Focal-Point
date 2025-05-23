module.exports = function notFoundPage(siteTitle = "Photo Gallery") {
  return `
    <html>
      <head>
        <title>404 Not Found | ${siteTitle}</title>
        <link rel="stylesheet" href="/styles.css">
      </head>
      <body class="notfound-body">
        <div class="notfound-container">
          <h1>404</h1>
          <p>Sorry, the page you requested could not be found.</p>
          <a href="/">Back to Home</a>
        </div>
      </body>
    </html>
  `;
};