import {google} from "googleapis";
import fs from "fs/promises";
import path from "path";
import imageDownloader from "image-downloader";
import authorization from "./authorization.cjs";
import checkpoint from "./checkpoint.cjs";
import logging from "./logging.cjs";
import {fileTypeFromFile} from 'file-type';
import config from "./config.js";
import { retryOperation, isValidUrl, sanitizeFilename, isValidEmailStructure, createError } from "./utils.js";

/**
 * Extracts image URLs from email body content
 * @param {string} mailBody - The email body content
 * @returns {string[]} Array of valid image URLs found in the email
 * @throws {Error} If mailBody is not a string or is empty
 */
function getImagesFromMail(mailBody) {
  if (typeof mailBody !== 'string') {
    throw createError('Mail body must be a string', 'getImagesFromMail');
  }
  
  if (!mailBody.trim()) {
    logging.logger.debug('Empty mail body provided');
    return [];
  }

  const searchTerm = "https://productionmbd.brighthorizons.com/m/snapshot";
  let searchIndex = mailBody.indexOf(searchTerm);
  const images = [];
  
  while (searchIndex !== -1) {
    try {
      // Read the URL up to the closing quotation mark
      const endQuoteIndex = mailBody.indexOf("\"", searchIndex);
      
      if (endQuoteIndex === -1) {
        logging.logger.warn(`No closing quote found for URL starting at position ${searchIndex}`);
        break;
      }
      
      const imageUrl = mailBody.slice(searchIndex, endQuoteIndex);
      
      // Validate the URL before adding it
      if (isValidUrl(imageUrl)) {
        images.push(imageUrl);
      } else {
        logging.logger.warn(`Invalid URL found: ${imageUrl}`);
      }
      
      searchIndex = mailBody.indexOf(searchTerm, searchIndex + 1);
    } catch (error) {
      logging.logger.error(`Error extracting URL at position ${searchIndex}:`, error);
      break;
    }
  }

  logging.logger.debug(`Extracted ${images.length} valid URLs from email body`);
  return images;
}

/**
 * Downloads images for a specific child from Gmail messages
 * @param {Object} gmail - Authenticated Gmail API client
 * @param {string} child - Child's name
 * @param {Date} lookbackDate - Date to search emails from
 * @returns {Promise<number>} Number of messages processed
 * @throws {Error} If Gmail operations fail or child name is invalid
 */
async function downloadImagesForChild(gmail, child, lookbackDate) {
  if (!child || typeof child !== 'string') {
    throw createError('Child name must be a non-empty string', 'downloadImagesForChild');
  }

  logging.logger.info(`Starting image download for child: ${child}`);

  try {
    // Ensure save folder exists
    await fs.mkdir(config.saveFolder, { recursive: true });

    // Get messages with retry logic
    const res = await retryOperation(
      () => gmail.users.messages.list({
        userId: 'me',
        q: `Daily Report for ${child} after:${lookbackDate.toLocaleDateString()}`
      }),
      config.maxRetries,
      config.retryDelayMs,
      `Gmail messages list for ${child}`
    );

    const messages = res.data.messages?.reverse() || [];
    logging.logger.info(`Found ${messages.length} messages for ${child}`);

    if (messages.length === 0) {
      return 0;
    }

    const checkpointDate = await checkpoint.getCheckpoint(child);
    let processedCount = 0;

    for (const message of messages) {
      try {
        await processMessage(gmail, message, child, checkpointDate);
        processedCount++;
      } catch (error) {
        logging.logger.error(`Failed to process message ${message.id} for ${child}:`, error);
        // Continue with other messages instead of failing completely
      }
    }

    logging.logger.info(`Successfully processed ${processedCount}/${messages.length} messages for ${child}`);
    return processedCount;

  } catch (error) {
    throw createError(`Failed to download images for ${child}`, 'downloadImagesForChild', error);
  }
}

/**
 * Processes a single Gmail message to extract and download images
 * @param {Object} gmail - Gmail API client
 * @param {Object} message - Gmail message object
 * @param {string} child - Child's name
 * @param {Date|null} checkpointDate - Last processed date
 */
async function processMessage(gmail, message, child, checkpointDate) {
  const mail = await retryOperation(
    () => gmail.users.messages.get({
      userId: 'me',
      id: message.id
    }),
    config.maxRetries,
    config.retryDelayMs,
    `Get Gmail message ${message.id}`
  );

  if (!isValidEmailStructure(mail)) {
    throw createError('Invalid email structure received', 'processMessage');
  }

  const messageDate = new Date(parseInt(mail.data.internalDate));
  const fileDate = formatDateForFile(messageDate);

  // Skip if already processed
  if (checkpointDate && messageDate <= checkpointDate) {
    logging.logger.debug(`Skipping previously processed email from ${messageDate.toLocaleDateString()}`);
    return;
  }

  // Extract email body
  const mailBody = extractEmailBody(mail.data);
  if (!mailBody) {
    logging.logger.warn(`No body content found in message ${message.id}`);
    return;
  }

  const images = getImagesFromMail(mailBody);
  
  if (images.length === 0) {
    logging.logger.debug(`No images found in message from ${messageDate.toLocaleDateString()}`);
    await checkpoint.setCheckpoint(child, mail.data.internalDate);
    return;
  }

  logging.logger.info(`Processing ${images.length} images from ${messageDate.toLocaleDateString()}`);

  // Download images
  let downloadedCount = 0;
  for (let i = 0; i < images.length; i++) {
    try {
      await downloadAndProcessImage(images[i], fileDate, i + 1, child);
      downloadedCount++;
    } catch (error) {
      logging.logger.error(`Failed to download image ${i + 1}/${images.length}:`, error);
      // Continue with other images
    }
  }

  logging.logger.info(`Successfully downloaded ${downloadedCount}/${images.length} images for ${messageDate.toLocaleDateString()}`);
  
  // Update checkpoint after successful processing
  await checkpoint.setCheckpoint(child, mail.data.internalDate);
}

/**
 * Extracts email body content from Gmail message data
 * @param {Object} mailData - Gmail message data
 * @returns {string|null} Decoded email body or null if not found
 */
function extractEmailBody(mailData) {
  try {
    if (!mailData.payload?.body?.data) {
      return null;
    }

    const bodyContent = JSON.stringify(mailData.payload.body.data);
    const buffer = Buffer.from(bodyContent, "base64");
    return buffer.toString();
  } catch (error) {
    logging.logger.error('Failed to extract email body:', error);
    return null;
  }
}

/**
 * Downloads and processes a single image, handling both images and videos
 * @param {string} imageUrl - URL of the image/video to download
 * @param {string} fileDate - Formatted date string for filename
 * @param {number} index - Image index in the email
 * @param {string} child - Child's name
 */
async function downloadAndProcessImage(imageUrl, fileDate, index, child) {
  const sanitizedChild = sanitizeFilename(child);
  const baseFileName = `${fileDate}_${index}_${sanitizedChild}`;
  const tempFileName = path.join(config.saveFolder, `${baseFileName}.tmp`);
  const imageFileName = path.join(config.saveFolder, `${baseFileName}.png`);

  try {
    // Download to temporary file first
    await retryOperation(
      () => imageDownloader.image({
        url: imageUrl,
        dest: tempFileName
      }),
      config.maxRetries,
      config.retryDelayMs,
      `Download image from ${imageUrl}`
    );

    // Determine file type
    const fileType = await fileTypeFromFile(tempFileName);
    
    if (!fileType) {
      logging.logger.warn(`Could not determine file type for ${tempFileName}`);
      await fs.unlink(tempFileName); // Clean up
      return;
    }

    // Determine final filename based on file type
    let finalFileName;
    if (fileType.mime === "image/png" || fileType.mime === "image/jpeg") {
      finalFileName = path.join(config.saveFolder, `${baseFileName}.${fileType.ext}`);
      logging.logger.debug(`Processing image file: ${fileType.mime}`);
    } else if (fileType.mime.startsWith('video/')) {
      finalFileName = path.join(config.saveFolder, `${baseFileName}.${fileType.ext}`);
      logging.logger.info(`Processing video file: ${fileType.mime}`);
    } else {
      finalFileName = path.join(config.saveFolder, `${baseFileName}.${fileType.ext || 'unknown'}`);
      logging.logger.warn(`Processing unknown file type: ${fileType.mime}`);
    }

    // Move temp file to final location
    await fs.rename(tempFileName, finalFileName);
    logging.logger.debug(`Successfully saved file: ${path.basename(finalFileName)}`);

  } catch (error) {
    // Clean up temp file if it exists
    try {
      await fs.unlink(tempFileName);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    
    throw createError(`Failed to download and process image from ${imageUrl}`, 'downloadAndProcessImage', error);
  }
}

/**
 * Formats a date for use in filenames (YYYY-MM-DD)
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDateForFile(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Main function that orchestrates the image downloading process
 * @param {google.auth.OAuth2} auth - An authorized OAuth2 client
 * @returns {Promise<Object>} Summary of processing results
 * @throws {Error} If configuration is invalid or authentication fails
 */
async function downloadImagesFromMail(auth) {
  // Validate configuration
  const configErrors = config.validate();
  if (configErrors.length > 0) {
    throw createError(`Invalid configuration: ${configErrors.join(', ')}`, 'downloadImagesFromMail');
  }

  const lookbackDate = new Date();
  lookbackDate.setTime(lookbackDate.getTime() - (config.lookbackHours * 60 * 60 * 1000));
  
  logging.logger.info(`Starting BH Scrape process for ${config.children.length} children, looking back ${config.lookbackHours} hours`);
  logging.logger.info(`Save folder: ${config.saveFolder}`);
  
  const gmail = google.gmail({version: 'v1', auth});
  const results = {
    children: [],
    totalMessagesProcessed: 0,
    errors: []
  };

  // Process each child
  for (const child of config.children) {
    const childResult = {
      name: child,
      messagesProcessed: 0,
      error: null
    };

    try {
      logging.logger.info(`Processing child: ${child}`);
      const messagesProcessed = await downloadImagesForChild(gmail, child, lookbackDate);
      childResult.messagesProcessed = messagesProcessed;
      results.totalMessagesProcessed += messagesProcessed;
      logging.logger.info(`Completed processing for ${child}: ${messagesProcessed} messages`);
    } catch (error) {
      const errorMessage = `Failed to process ${child}: ${error.message}`;
      logging.logger.error(errorMessage, error);
      childResult.error = errorMessage;
      results.errors.push(errorMessage);
    }

    results.children.push(childResult);
  }

  // Log summary
  logging.logger.info('=== BH Scrape Summary ===');
  logging.logger.info(`Total messages processed: ${results.totalMessagesProcessed}`);
  logging.logger.info(`Children processed: ${results.children.length}`);
  logging.logger.info(`Errors encountered: ${results.errors.length}`);
  
  if (results.errors.length > 0) {
    logging.logger.error('Errors during processing:');
    results.errors.forEach(error => logging.logger.error(`  - ${error}`));
  }

  return results;
}

/**
 * Application entry point with proper error handling
 */
async function main() {
  try {
    const auth = await authorization.authorize();
    const results = await downloadImagesFromMail(auth);
    
    // Exit with error code if there were processing errors
    if (results.errors.length > 0) {
      process.exit(1);
    }
    
    logging.logger.info('BH Scrape completed successfully');
  } catch (error) {
    logging.logger.error('Fatal error in BH Scrape:', error);
    process.exit(1);
  }
}

// Run the script - maintain compatibility with original execution
authorization.authorize().then(downloadImagesFromMail).catch(logging.logger.error.bind(logging.logger));

export { 
  getImagesFromMail, 
  downloadImagesForChild, 
  processMessage, 
  extractEmailBody,
  downloadAndProcessImage,
  formatDateForFile,
  downloadImagesFromMail 
};