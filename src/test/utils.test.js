import { describe, it } from 'node:test';
import assert from 'node:assert';
import { 
  sleep, 
  retryOperation, 
  isValidUrl, 
  sanitizeFilename, 
  isValidEmailStructure, 
  createError 
} from '../utils.js';

describe('sleep', () => {
  it('should sleep for specified milliseconds', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    
    // Allow some tolerance for timing
    assert(elapsed >= 45 && elapsed <= 100, `Expected ~50ms, got ${elapsed}ms`);
  });
});

describe('retryOperation', () => {
  it('should succeed on first try', async () => {
    let callCount = 0;
    const operation = async () => {
      callCount++;
      return 'success';
    };

    const result = await retryOperation(operation, 3, 10, 'test');
    
    assert.strictEqual(result, 'success');
    assert.strictEqual(callCount, 1);
  });

  it('should retry on failure and eventually succeed', async () => {
    let callCount = 0;
    const operation = async () => {
      callCount++;
      if (callCount < 3) {
        throw new Error('Temporary failure');
      }
      return 'success';
    };

    const result = await retryOperation(operation, 3, 1, 'test');
    
    assert.strictEqual(result, 'success');
    assert.strictEqual(callCount, 3);
  });

  it('should fail after max retries', async () => {
    let callCount = 0;
    const operation = async () => {
      callCount++;
      throw new Error('Persistent failure');
    };

    try {
      await retryOperation(operation, 2, 1, 'test');
      assert.fail('Should have thrown an error');
    } catch (error) {
      assert.strictEqual(error.message, 'Persistent failure');
      assert.strictEqual(callCount, 3); // Initial attempt + 2 retries
    }
  });
});

describe('isValidUrl', () => {
  it('should return true for valid URLs', () => {
    assert.strictEqual(isValidUrl('https://example.com'), true);
    assert.strictEqual(isValidUrl('http://example.com'), true);
    assert.strictEqual(isValidUrl('https://productionmbd.brighthorizons.com/m/snapshot/12345'), true);
    assert.strictEqual(isValidUrl('ftp://example.com'), true);
  });

  it('should return false for invalid URLs', () => {
    assert.strictEqual(isValidUrl('not-a-url'), false);
    assert.strictEqual(isValidUrl(''), false);
    assert.strictEqual(isValidUrl('just text'), false);
    assert.strictEqual(isValidUrl('http://'), false);
  });

  it('should handle null and undefined', () => {
    assert.strictEqual(isValidUrl(null), false);
    assert.strictEqual(isValidUrl(undefined), false);
  });
});

describe('sanitizeFilename', () => {
  it('should replace invalid characters', () => {
    const input = 'file<name>with:invalid"chars/\\|?*.txt';
    const result = sanitizeFilename(input);
    
    // Should replace all invalid characters with underscores
    assert.strictEqual(result, 'file_name_with_invalid_chars_____.txt');
    
    // Verify no invalid characters remain
    const invalidChars = /[<>:"/\\|?*]/g;
    assert.strictEqual(invalidChars.test(result), false);
  });

  it('should leave valid filenames unchanged', () => {
    const validFilename = 'valid-filename_123.txt';
    assert.strictEqual(sanitizeFilename(validFilename), validFilename);
  });

  it('should handle empty string', () => {
    assert.strictEqual(sanitizeFilename(''), '');
  });
});

describe('isValidEmailStructure', () => {
  it('should return true for valid email structure', () => {
    const validMail = {
      data: {
        payload: {
          body: {
            data: 'some-data'
          }
        },
        internalDate: '1234567890'
      }
    };
    
    assert.strictEqual(isValidEmailStructure(validMail), true);
  });

  it('should return false for invalid structures', () => {
    // Test null and undefined cases
    assert.strictEqual(isValidEmailStructure(null), false);
    assert.strictEqual(isValidEmailStructure(undefined), false);
    
    // Test incomplete structures
    assert.strictEqual(isValidEmailStructure({}), false);
    assert.strictEqual(isValidEmailStructure({ data: {} }), false);
    assert.strictEqual(isValidEmailStructure({ 
      data: { 
        payload: {} 
      } 
    }), false);
    
    // Test with non-string internalDate
    assert.strictEqual(isValidEmailStructure({ 
      data: { 
        payload: { body: {} },
        internalDate: 123 // Should be string
      } 
    }), false);
  });

  it('should require internalDate as string', () => {
    const mailWithNumberDate = {
      data: {
        payload: { body: {} },
        internalDate: 1234567890 // Number instead of string
      }
    };
    
    assert.strictEqual(isValidEmailStructure(mailWithNumberDate), false);
  });
});

describe('createError', () => {
  it('should create error with operation context', () => {
    const error = createError('Something failed', 'testOperation');
    
    assert(error instanceof Error);
    assert.strictEqual(error.message, 'testOperation: Something failed');
    assert.strictEqual(error.operation, 'testOperation');
  });

  it('should chain original error', () => {
    const originalError = new Error('Original error');
    const error = createError('Wrapper message', 'testOperation', originalError);
    
    assert.strictEqual(error.message, 'testOperation: Wrapper message');
    assert.strictEqual(error.cause, originalError);
    assert(error.stack.includes('Caused by:'));
  });

  it('should work without original error', () => {
    const error = createError('Simple error', 'testOperation');
    
    assert.strictEqual(error.message, 'testOperation: Simple error');
    assert.strictEqual(error.operation, 'testOperation');
    assert.strictEqual(error.cause, undefined);
  });
});