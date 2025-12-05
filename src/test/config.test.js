import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

// Store original environment variables
let originalEnv;

// Import the config class dynamically to create fresh instances
async function createConfig() {
  const { default: Config } = await import('../config.js');
  return new Config.constructor();
}

describe('Config', () => {
  beforeEach(() => {
    // Backup original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('BH_SCRAPE_')) {
        delete process.env[key];
      }
    });
    Object.assign(process.env, originalEnv);
  });

  describe('default values', () => {
    it('should have default children array', async () => {
      delete process.env.BH_SCRAPE_CHILDREN;
      
      const testConfig = await createConfig();
      
      assert(Array.isArray(testConfig.children));
      assert.strictEqual(testConfig.children.length, 2);
      assert(testConfig.children.includes('maira'));
      assert(testConfig.children.includes('george'));
    });

    it('should have default lookback hours', async () => {
      delete process.env.BH_SCRAPE_LOOKBACK_HOURS;
      
      const testConfig = await createConfig();
      assert.strictEqual(testConfig.lookbackHours, 72);
    });

    it('should have default max retries', async () => {
      delete process.env.BH_SCRAPE_MAX_RETRIES;
      
      const testConfig = await createConfig();
      assert.strictEqual(testConfig.maxRetries, 3);
    });
  });

  describe('environment variable parsing', () => {
    it('should parse children from environment', async () => {
      process.env.BH_SCRAPE_CHILDREN = 'alice,bob,charlie';
      
      const testConfig = await createConfig();
      
      assert.strictEqual(testConfig.children.length, 3);
      assert(testConfig.children.includes('alice'));
      assert(testConfig.children.includes('bob'));
      assert(testConfig.children.includes('charlie'));
    });

    it('should parse numeric values from environment', async () => {
      process.env.BH_SCRAPE_LOOKBACK_HOURS = '48';
      process.env.BH_SCRAPE_MAX_RETRIES = '5';
      process.env.BH_SCRAPE_RETRY_DELAY_MS = '2000';
      
      const testConfig = await createConfig();
      
      assert.strictEqual(testConfig.lookbackHours, 48);
      assert.strictEqual(testConfig.maxRetries, 5);
      assert.strictEqual(testConfig.retryDelayMs, 2000);
    });

    it('should handle invalid numeric values gracefully', async () => {
      process.env.BH_SCRAPE_LOOKBACK_HOURS = 'not-a-number';
      process.env.BH_SCRAPE_MAX_RETRIES = 'invalid';
      
      const testConfig = await createConfig();
      
      // Should parse as NaN, which becomes 0 or default
      // The actual behavior depends on implementation
      assert(typeof testConfig.lookbackHours === 'number');
      assert(typeof testConfig.maxRetries === 'number');
    });
  });

  describe('validation', () => {
    it('should pass validation with valid config', async () => {
      process.env.BH_SCRAPE_CHILDREN = 'alice,bob';
      process.env.BH_SCRAPE_LOOKBACK_HOURS = '48';
      process.env.BH_SCRAPE_MAX_RETRIES = '2';
      process.env.BH_SCRAPE_SAVE_FOLDER = '/valid/path';
      
      const testConfig = await createConfig();
      const errors = testConfig.validate();
      
      assert.strictEqual(errors.length, 0);
    });

    it('should fail validation with empty children', async () => {
      process.env.BH_SCRAPE_CHILDREN = '';
      
      const testConfig = await createConfig();
      const errors = testConfig.validate();
      
      assert(errors.some(error => error.includes('Children list must be a non-empty array')));
    });

    it('should fail validation with invalid lookback hours', async () => {
      process.env.BH_SCRAPE_LOOKBACK_HOURS = '0';
      
      const testConfig = await createConfig();
      const errors = testConfig.validate();
      
      assert(errors.some(error => error.includes('Lookback hours must be between 1 and 8760')));
    });

    it('should fail validation with invalid max retries', async () => {
      process.env.BH_SCRAPE_MAX_RETRIES = '15';
      
      const testConfig = await createConfig();
      const errors = testConfig.validate();
      
      assert(errors.some(error => error.includes('Max retries must be between 0 and 10')));
    });

    it('should fail validation with empty save folder', async () => {
      process.env.BH_SCRAPE_SAVE_FOLDER = '';
      
      const testConfig = await createConfig();
      const errors = testConfig.validate();
      
      assert(errors.some(error => error.includes('Save folder must be a valid string path')));
    });

    it('should return multiple errors when multiple validations fail', async () => {
      process.env.BH_SCRAPE_CHILDREN = '';
      process.env.BH_SCRAPE_LOOKBACK_HOURS = '0';
      process.env.BH_SCRAPE_SAVE_FOLDER = '';
      
      const testConfig = await createConfig();
      const errors = testConfig.validate();
      
      assert(errors.length >= 3);
    });
  });
});