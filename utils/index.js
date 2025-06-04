// Aggregates and re-exports utility modules for admin, categories, images, and settings.
//
// Exports:
//   - All exports from admin.js, categories.js, images.js, and settings.js.
//

module.exports = {
    ...require('./admin'),
    ...require('./categories'),
    ...require('./images'),
    ...require('./settings') // getSettingsWithDefaults now exported
};