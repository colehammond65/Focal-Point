/**
 * Integration tests for core utility functions
 * Tests the interaction between utilities and validates core functionality
 */

const path = require('path');
const fs = require('fs');

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-testing-only';

describe('Utility Functions Integration', () => {
  describe('Dynamic CSS Generation', () => {
    const generateDynamicCss = require('../utils/dynamicCss');

    test('should generate CSS with default accent color', async () => {
      // Mock the CSS file reading
      const mockCss = '/* ACCENT_COLOR_INJECT */ body { margin: 0; }';
      const originalReadFile = fs.promises.readFile;
      
      // Mock fs.readFile to return our test CSS
      fs.promises.readFile = jest.fn().mockResolvedValue(mockCss);
      
      const result = await generateDynamicCss();
      
      expect(result).toContain('--primary-color: #2ecc71');
      expect(result).toContain('/* injected by server */');
      expect(result).not.toContain('/* ACCENT_COLOR_INJECT */');
      
      // Restore original function
      fs.promises.readFile = originalReadFile;
    });

    test('should generate CSS with custom accent color', async () => {
      const mockCss = '/* ACCENT_COLOR_INJECT */ body { margin: 0; }';
      const originalReadFile = fs.promises.readFile;
      
      fs.promises.readFile = jest.fn().mockResolvedValue(mockCss);
      
      const customColor = '#ff6b6b';
      const result = await generateDynamicCss(customColor);
      
      expect(result).toContain(`--primary-color: ${customColor}`);
      
      fs.promises.readFile = originalReadFile;
    });
  });

  describe('Logger Configuration', () => {
    test('should create logger instance', () => {
      const logger = require('../utils/logger');
      
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    test('should have correct log level configuration', () => {
      const logger = require('../utils/logger');
      
      // Logger should be configured with 'info' level
      expect(logger.level).toBe('info');
    });
  });

  describe('Utility Index Export', () => {
    test('should export all required utility functions', () => {
      const utils = require('../utils/index');
      
      // Check that all major utility functions are exported
      expect(typeof utils.getCategoriesWithPreviews).toBe('function');
      expect(typeof utils.isSafeCategory).toBe('function');
      expect(typeof utils.categoryExists).toBe('function');
      expect(typeof utils.adminExists).toBe('function');
      expect(typeof utils.getSetting).toBe('function');
    });
  });

  describe('File System Safety', () => {
    test('should validate safe category names', () => {
      const { isSafeCategory } = require('../utils/categories');
      
      // Safe category names
      expect(isSafeCategory('weddings')).toBe(true);
      expect(isSafeCategory('portrait-2024')).toBe(true);
      expect(isSafeCategory('family_photos')).toBe(true);
      
      // Unsafe category names
      expect(isSafeCategory('../admin')).toBe(false);
      expect(isSafeCategory('../../etc')).toBe(false);
      expect(isSafeCategory('category with spaces')).toBe(false);
      expect(isSafeCategory('category/with/slashes')).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle missing CSS file gracefully', async () => {
      const generateDynamicCss = require('../utils/dynamicCss');
      const originalReadFile = fs.promises.readFile;
      
      // Mock file read error
      fs.promises.readFile = jest.fn().mockRejectedValue(new Error('File not found'));
      
      await expect(generateDynamicCss()).rejects.toThrow('File not found');
      
      fs.promises.readFile = originalReadFile;
    });
  });
});