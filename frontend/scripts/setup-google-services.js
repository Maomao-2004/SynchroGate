#!/usr/bin/env node
/**
 * Script to setup google-services.json for EAS builds
 * This script writes google-services.json from EAS secret or uses existing file
 */

const fs = require('fs');
const path = require('path');

const GOOGLE_SERVICES_JSON = process.env.GOOGLE_SERVICES_JSON;
const rootDir = path.resolve(__dirname, '..');
const googleServicesPath = path.join(rootDir, 'google-services.json');
const androidAppPath = path.join(rootDir, 'android', 'app', 'google-services.json');
const androidReleasePath = path.join(rootDir, 'android', 'app', 'src', 'release', 'google-services.json');

console.log('📦 Setting up google-services.json for Android build...');

// Function to ensure directory exists
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Function to write google-services.json
function writeGoogleServices(content, targetPath) {
  try {
    ensureDir(path.dirname(targetPath));
    fs.writeFileSync(targetPath, content, 'utf8');
    console.log(`✅ Created ${path.relative(rootDir, targetPath)}`);
    return true;
  } catch (error) {
    console.error(`❌ Error writing to ${targetPath}:`, error.message);
    return false;
  }
}

// Main logic
if (GOOGLE_SERVICES_JSON) {
  // Use content from EAS secret
  console.log('📝 Using google-services.json from EAS secret...');
  
  // Write to root
  if (!writeGoogleServices(GOOGLE_SERVICES_JSON, googleServicesPath)) {
    process.exit(1);
  }
  
  // Write to android/app
  if (!writeGoogleServices(GOOGLE_SERVICES_JSON, androidAppPath)) {
    process.exit(1);
  }
  
  // Write to android/app/src/release
  if (!writeGoogleServices(GOOGLE_SERVICES_JSON, androidReleasePath)) {
    process.exit(1);
  }
  
  console.log('✅ Successfully set up google-services.json from EAS secret');
} else if (fs.existsSync(googleServicesPath)) {
  // Use existing file from repository
  console.log('📝 Using existing google-services.json from repository...');
  
  const content = fs.readFileSync(googleServicesPath, 'utf8');
  
  // Copy to android/app
  if (!writeGoogleServices(content, androidAppPath)) {
    process.exit(1);
  }
  
  // Copy to android/app/src/release
  if (!writeGoogleServices(content, androidReleasePath)) {
    process.exit(1);
  }
  
  console.log('✅ Successfully copied google-services.json to Android directories');
} else {
  console.error('❌ Error: google-services.json not found and GOOGLE_SERVICES_JSON secret not set');
  console.error('');
  console.error('Please either:');
  console.error('  1. Commit google-services.json to your git repository, or');
  console.error('  2. Set GOOGLE_SERVICES_JSON as an EAS secret:');
  console.error('     eas secret:create --scope project --name GOOGLE_SERVICES_JSON --type string');
  console.error('');
  process.exit(1);
}

console.log('✅ Google Services setup complete!');

























