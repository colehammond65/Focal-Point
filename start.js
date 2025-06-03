// start.js
// Entry point to start the Express server for the Focal Point application.
const app = require('./server');
const PORT = process.env.PORT || 3000;

// Start the server and log the URL
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});