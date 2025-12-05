import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { 
  getImagesFromMail, 
  extractEmailBody, 
  formatDateForFile,
} from '../index.js';

describe('getImagesFromMail', () => {
  it('should extract valid URLs from email body', () => {
    const mailBody = `
      Some text before
      "https://productionmbd.brighthorizons.com/m/snapshot/12345"
      Some text between
      "https://productionmbd.brighthorizons.com/m/snapshot/67890"
      Some text after
    `;
    
    const images = getImagesFromMail(mailBody);
    
    assert.strictEqual(images.length, 2);
    assert.strictEqual(images[0], 'https://productionmbd.brighthorizons.com/m/snapshot/12345');
    assert.strictEqual(images[1], 'https://productionmbd.brighthorizons.com/m/snapshot/67890');
  });

  it('should return empty array for empty mail body', () => {
    const images = getImagesFromMail('');
    assert.strictEqual(images.length, 0);
  });

  it('should return empty array when no URLs found', () => {
    const mailBody = 'This is just regular text with no URLs';
    const images = getImagesFromMail(mailBody);
    assert.strictEqual(images.length, 0);
  });

  it('should handle malformed URLs gracefully', () => {
    const mailBody = `
      "https://productionmbd.brighthorizons.com/m/snapshot/12345"
      "not-a-valid-url"
      "https://productionmbd.brighthorizons.com/m/snapshot/67890"
    `;
    
    const images = getImagesFromMail(mailBody);
    
    // Should only extract valid URLs
    assert.strictEqual(images.length, 2);
    assert.strictEqual(images[0], 'https://productionmbd.brighthorizons.com/m/snapshot/12345');
    assert.strictEqual(images[1], 'https://productionmbd.brighthorizons.com/m/snapshot/67890');
  });

  it('should throw error for non-string input', () => {
    assert.throws(() => {
      getImagesFromMail(null);
    }, /Mail body must be a string/);
    
    assert.throws(() => {
      getImagesFromMail(123);
    }, /Mail body must be a string/);
    
    assert.throws(() => {
      getImagesFromMail({});
    }, /Mail body must be a string/);
  });

  it('should handle URLs without closing quotes', () => {
    const mailBody = 'https://productionmbd.brighthorizons.com/m/snapshot/12345';
    const images = getImagesFromMail(mailBody);
    assert.strictEqual(images.length, 0); // Should not find URLs without proper quote structure
  });
});

describe('extractEmailBody', () => {
  it('should extract body from valid mail data', () => {
    const testData = 'test body content';
    const encodedData = Buffer.from(JSON.stringify(testData), 'utf-8').toString('base64');
    
    const mailData = {
      payload: {
        body: {
          data: encodedData
        }
      }
    };
    
    const result = extractEmailBody(mailData);
    assert.strictEqual(typeof result, 'string');
    assert(result.includes(testData));
  });

  it('should return null for invalid mail data', () => {
    assert.strictEqual(extractEmailBody({}), null);
    assert.strictEqual(extractEmailBody({ payload: {} }), null);
    assert.strictEqual(extractEmailBody({ payload: { body: {} } }), null);
    assert.strictEqual(extractEmailBody(null), null);
  });

  it('should handle malformed base64 data gracefully', () => {
    const mailData = {
      payload: {
        body: {
          data: 'invalid-base64-data'
        }
      }
    };
    
    // Should not throw, but may return null or handle gracefully
    const result = extractEmailBody(mailData);
    // The function should handle this gracefully and return a string or null
    assert(result === null || typeof result === 'string');
  });
});

describe('formatDateForFile', () => {
  it('should format date correctly', () => {
    const date = new Date('2023-05-15T10:30:00Z');
    const formatted = formatDateForFile(date);
    assert.strictEqual(formatted, '2023-05-15');
  });

  it('should handle single digit months and days', () => {
    const date = new Date('2023-01-05T10:30:00Z');
    const formatted = formatDateForFile(date);
    assert.strictEqual(formatted, '2023-01-05');
  });

  it('should handle year boundaries', () => {
    const date = new Date('2023-12-31T23:59:59Z');
    const formatted = formatDateForFile(date);
    assert.strictEqual(formatted, '2023-12-31');
  });
});