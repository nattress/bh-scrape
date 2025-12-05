import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Configuration management with environment variable support
 */
class Config {
  constructor() {
    this.children = process.env.BH_SCRAPE_CHILDREN?.split(',') || ["maira", "george"];
    this.saveFolder = process.env.BH_SCRAPE_SAVE_FOLDER || "C:\\Users\\Simon\\Dropbox\\maira_in";
    this.lookbackHours = parseInt(process.env.BH_SCRAPE_LOOKBACK_HOURS) || 72;
    this.tokenPath = process.env.BH_SCRAPE_TOKEN_PATH || path.join(__dirname, 'token.json');
    this.credentialsPath = process.env.BH_SCRAPE_CREDENTIALS_PATH || path.join(__dirname, 'credentials.json');
    this.maxRetries = parseInt(process.env.BH_SCRAPE_MAX_RETRIES) || 3;
    this.retryDelayMs = parseInt(process.env.BH_SCRAPE_RETRY_DELAY_MS) || 1000;
  }

  /**
   * Validates configuration values
   * @returns {Array<string>} Array of validation errors, empty if valid
   */
  validate() {
    const errors = [];
    
    if (!Array.isArray(this.children) || this.children.length === 0) {
      errors.push('Children list must be a non-empty array');
    }
    
    if (!this.saveFolder || typeof this.saveFolder !== 'string') {
      errors.push('Save folder must be a valid string path');
    }
    
    if (this.lookbackHours < 1 || this.lookbackHours > 8760) {
      errors.push('Lookback hours must be between 1 and 8760 (1 year)');
    }
    
    if (this.maxRetries < 0 || this.maxRetries > 10) {
      errors.push('Max retries must be between 0 and 10');
    }
    
    return errors;
  }
}

export default new Config();