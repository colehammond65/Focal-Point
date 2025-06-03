// Renders a 404 Not Found HTML page
//
// Exports:
//   - notFoundPage: Returns a styled 404 HTML string for the site.
module.exports = function notFoundPage(siteTitle = "Focal Point") {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>404 Not Found | ${siteTitle}</title>
        <link rel="stylesheet" href="/styles.css">
      </head>
      <body class="notfound-body">
        <div class="notfound-container">
          <h1>404</h1>
          <p>Sorry, the page you requested could not be found.</p>
          <a href="/" class="btn btn-primary">Back to Home</a>
        </div>
      </body>
    </html>
  `;
};