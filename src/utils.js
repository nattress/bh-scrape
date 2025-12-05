import logging from "./logging.cjs";

/**
 * Utility functions for error handling and validation
 */

/**
 * Sleeps for the specified number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retries an async function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum number of retry attempts
 * @param {number} baseDelayMs - Base delay in milliseconds
 * @param {string} operationName - Name of operation for logging
 * @returns {Promise<any>} Result of the function
 */
export async function retryOperation(fn, maxRetries, baseDelayMs, operationName) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        logging.logger.error(`${operationName} failed after ${maxRetries + 1} attempts:`, error);
        throw error;
      }
      
      const delay = baseDelayMs * Math.pow(2, attempt);
      logging.logger.warn(`${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`, error.message);
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * Validates if a string is a valid URL
 * @param {string} urlString - String to validate
 * @returns {boolean} True if valid URL
 */
export function isValidUrl(urlString) {
  try {
    new URL(urlString);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitizes filename to remove invalid characters
 * @param {string} filename - Original filename
 * @returns {string} Sanitized filename
 */
export function sanitizeFilename(filename) {
  return filename.replace(/[<>:"/\\|?*]/g, '_');
}

/**
 * Validates email content structure
 * @param {object} mailData - Gmail message data
 * @returns {boolean} True if valid structure
 */
export function isValidEmailStructure(mailData) {
  return Boolean(
    mailData &&
    mailData.data &&
    mailData.data.payload &&
    mailData.data.internalDate &&
    typeof mailData.data.internalDate === 'string'
  );
}

/**
 * Creates a standardized error with context
 * @param {string} message - Error message
 * @param {string} operation - Operation that failed
 * @param {Error} originalError - Original error if any
 * @returns {Error} Enhanced error with context
 */
export function createError(message, operation, originalError = null) {
  const error = new Error(`${operation}: ${message}`);
  error.operation = operation;
  if (originalError) {
    error.cause = originalError;
    error.stack = `${error.stack}\nCaused by: ${originalError.stack}`;
  }
  return error;
}