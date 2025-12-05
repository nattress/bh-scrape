#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readdir } from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Test runner script using Node.js built-in test runner
 * Supports running individual test files or all tests
 */

class TestRunner {
  constructor() {
    this.testDir = join(__dirname, 'test');
    this.passed = 0;
    this.failed = 0;
    this.testFiles = [];
  }

  /**
   * Discovers all test files in the test directory
   */
  async discoverTestFiles() {
    try {
      const files = await readdir(this.testDir);
      this.testFiles = files
        .filter(file => file.endsWith('.test.js'))
        .map(file => join(this.testDir, file));
      
      console.log(`📁 Found ${this.testFiles.length} test files`);
      return this.testFiles;
    } catch (error) {
      console.error('❌ Failed to discover test files:', error.message);
      process.exit(1);
    }
  }

  /**
   * Runs a single test file
   * @param {string} testFile - Path to test file
   * @returns {Promise<boolean>} True if tests passed
   */
  async runTestFile(testFile) {
    return new Promise((resolve) => {
      console.log(`\n🧪 Running ${testFile}...`);
      
      const testProcess = spawn('node', ['--test', testFile], {
        stdio: 'pipe',
        cwd: process.cwd()
      });

      let output = '';
      let errorOutput = '';

      testProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      testProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      testProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ ${testFile} passed`);
          this.passed++;
          this.printTestOutput(output, false);
          resolve(true);
        } else {
          console.log(`❌ ${testFile} failed`);
          this.failed++;
          this.printTestOutput(output, true);
          if (errorOutput) {
            console.error('Error output:', errorOutput);
          }
          resolve(false);
        }
      });

      testProcess.on('error', (error) => {
        console.error(`❌ Failed to run ${testFile}:`, error.message);
        this.failed++;
        resolve(false);
      });
    });
  }

  /**
   * Prints test output with formatting
   * @param {string} output - Test output
   * @param {boolean} isError - Whether this is error output
   */
  printTestOutput(output, isError = false) {
    if (!output.trim()) return;

    const lines = output.trim().split('\n');
    const prefix = isError ? '  ❌' : '  ℹ️';
    
    // Show only summary lines and failures for cleaner output
    const relevantLines = lines.filter(line => 
      line.includes('✓') || 
      line.includes('✗') || 
      line.includes('tests') ||
      line.includes('passing') ||
      line.includes('failing') ||
      line.includes('AssertionError') ||
      isError
    );

    if (relevantLines.length > 0) {
      console.log(prefix + ' Test details:');
      relevantLines.forEach(line => {
        if (line.trim()) {
          console.log(`    ${line.trim()}`);
        }
      });
    }
  }

  /**
   * Runs all discovered test files
   */
  async runAllTests() {
    console.log('🚀 Starting test suite...\n');
    
    await this.discoverTestFiles();
    
    if (this.testFiles.length === 0) {
      console.log('⚠️  No test files found');
      return;
    }

    const startTime = Date.now();

    for (const testFile of this.testFiles) {
      await this.runTestFile(testFile);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    this.printSummary(duration);
  }

  /**
   * Runs a specific test file by name
   * @param {string} testFileName - Name of test file to run
   */
  async runSpecificTest(testFileName) {
    await this.discoverTestFiles();
    
    const testFile = this.testFiles.find(file => 
      file.includes(testFileName) || file.endsWith(testFileName)
    );

    if (!testFile) {
      console.error(`❌ Test file "${testFileName}" not found`);
      console.log('Available test files:');
      this.testFiles.forEach(file => {
        console.log(`  - ${file.split('/').pop()}`);
      });
      process.exit(1);
    }

    const startTime = Date.now();
    await this.runTestFile(testFile);
    const endTime = Date.now();
    
    this.printSummary(endTime - startTime);
  }

  /**
   * Prints test run summary
   * @param {number} duration - Test run duration in milliseconds
   */
  printSummary(duration) {
    console.log('\n' + '='.repeat(50));
    console.log('📊 Test Summary');
    console.log('='.repeat(50));
    console.log(`✅ Passed: ${this.passed}`);
    console.log(`❌ Failed: ${this.failed}`);
    console.log(`⏱️  Duration: ${duration}ms`);
    
    if (this.failed === 0) {
      console.log('\n🎉 All tests passed!');
      process.exit(0);
    } else {
      console.log('\n💥 Some tests failed!');
      process.exit(1);
    }
  }

  /**
   * Shows usage information
   */
  showUsage() {
    console.log(`
📖 BH Scrape Test Runner

Usage:
  node test-runner.js                    # Run all tests
  node test-runner.js <test-file>        # Run specific test file
  node test-runner.js --help            # Show this help

Examples:
  node test-runner.js                    # Run all tests
  node test-runner.js utils.test.js      # Run utils tests only
  node test-runner.js index             # Run index tests (partial match)

Available test files will be auto-discovered from the test/ directory.
    `);
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const runner = new TestRunner();

  // Handle help flag
  if (args.includes('--help') || args.includes('-h')) {
    runner.showUsage();
    return;
  }

  // Handle specific test file
  if (args.length > 0) {
    await runner.runSpecificTest(args[0]);
    return;
  }

  // Run all tests
  await runner.runAllTests();
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Promise Rejection:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ Fatal error in test runner:', error);
    process.exit(1);
  });
}