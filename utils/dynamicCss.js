/**
 * @fileoverview Dynamic CSS generation utility for the Focal Point application.
 * 
 * This module provides functionality to dynamically inject customizable style
 * variables into the application's CSS. It allows photographers to customize
 * their gallery's appearance through the admin interface by modifying colors
 * and other visual elements.
 * 
 * Features:
 * - Dynamic accent color injection
 * - CSS variable replacement at runtime
 * - Server-side style customization
 * - Maintains base CSS structure while allowing customization
 * 
 * @author Cole Hammond
 * @version 1.0.0
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Generates dynamic CSS by injecting custom accent color into base styles.
 * 
 * Reads the base CSS file and replaces placeholder comments with actual
 * CSS custom properties. This allows for dynamic theming without requiring
 * CSS preprocessing or client-side modifications.
 * 
 * @async
 * @function generateDynamicCss
 * @param {string} [accentColor='#2ecc71'] - The accent color to inject into CSS
 * @returns {Promise<string>} The modified CSS content with injected variables
 * @throws {Error} If the CSS file cannot be read or processed
 * 
 * @example
 * const css = await generateDynamicCss('#ff6b6b');
 * // Returns CSS with: --primary-color: #ff6b6b;
 * 
 * @example
 * // Using default color
 * const css = await generateDynamicCss();
 * // Returns CSS with: --primary-color: #2ecc71;
 */
async function generateDynamicCss(accentColor = '#2ecc71') {
    const cssPath = path.join(__dirname, '..', 'public', 'styles.css');
    let css = await fs.readFile(cssPath, 'utf8');
    
    // Replace the ACCENT_COLOR_INJECT comment with the accent color variable
    css = css.replace(
        /\/\* ACCENT_COLOR_INJECT \*\//,
        `--primary-color: ${accentColor}; /* injected by server */`
    );
    
    return css;
}

module.exports = generateDynamicCss;
