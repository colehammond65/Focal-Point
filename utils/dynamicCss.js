// Utility for generating dynamic CSS with a custom accent color.
//
// Exports:
//   - generateDynamicCss: Reads the base CSS and injects the accent color variable.
//
// utils/dynamicCss.js
const fs = require('fs');
const path = require('path');

function generateDynamicCss(accentColor = '#2ecc71') {
    const cssPath = path.join(__dirname, '..', 'public', 'styles.css');
    let css = fs.readFileSync(cssPath, 'utf8');
    // Replace the ACCENT_COLOR_INJECT comment with the accent color variable
    css = css.replace(
        /\/\* ACCENT_COLOR_INJECT \*\//,
        `--primary-color: ${accentColor}; /* injected by server */`
    );
    return css;
}

module.exports = generateDynamicCss;
