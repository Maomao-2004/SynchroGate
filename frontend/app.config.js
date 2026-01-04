const fs = require('fs');
const path = require('path');

// Read the existing app.json
const appJson = require('./app.json');

// Setup google-services.json from EAS secret or existing file
const GOOGLE_SERVICES_JSON = process.env.GOOGLE_SERVICES_JSON;
const googleServicesPath = path.join(__dirname, 'google-services.json');

function writeGoogleServices(content, targetPath) {
  try {
    // Parse and validate JSON first
    let jsonContent;
    try {
      jsonContent = typeof content === 'string' ? JSON.parse(content) : content;
    } catch (parseError) {
      console.error('❌ Error: Invalid JSON in google-services.json:', parseError.message);
      throw new Error(`Invalid JSON: ${parseError.message}`);
    }
    
    // Stringify with proper formatting (2 spaces indentation)
    const formattedJson = JSON.stringify(jsonContent, null, 2);
    
    // Ensure directory exists
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Write the file
    fs.writeFileSync(targetPath, formattedJson, 'utf8');
    return true;
  } catch (error) {
    console.error(`❌ Error writing ${targetPath}:`, error.message);
    return false;
  }
}

let googleServicesContent = null;

// Try to use EAS secret first, but fall back to file if secret is invalid
if (GOOGLE_SERVICES_JSON && 
    GOOGLE_SERVICES_JSON !== '@GOOGLE_SERVICES_JSON' && 
    GOOGLE_SERVICES_JSON.trim().length > 0) {
  // Try to parse and validate the secret
  try {
    JSON.parse(GOOGLE_SERVICES_JSON);
    // If parsing succeeds, use the secret
    console.log('📝 Writing google-services.json from EAS secret...');
    if (writeGoogleServices(GOOGLE_SERVICES_JSON, googleServicesPath)) {
      console.log('✅ Created google-services.json from secret');
      googleServicesContent = GOOGLE_SERVICES_JSON;
    } else {
      console.warn('⚠️  Failed to write from secret, falling back to file from git');
      // Fall through to use file from git
    }
  } catch (parseError) {
    console.warn('⚠️  EAS secret contains invalid JSON, using file from git instead');
    // Fall through to use file from git
  }
}

// Use existing file from repository (either as primary source or fallback)
if (!googleServicesContent) {
  // Try multiple possible locations
  const possiblePaths = [
    googleServicesPath, // Root of frontend directory
    path.join(__dirname, '..', 'google-services.json'), // Parent directory
    path.join(process.cwd(), 'google-services.json'), // Current working directory
  ];
  
  let foundPath = null;
  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      foundPath = possiblePath;
      break;
    }
  }
  
  if (foundPath) {
    console.log(`📝 Using google-services.json from ${path.relative(__dirname, foundPath)}...`);
    googleServicesContent = fs.readFileSync(foundPath, 'utf8');
  } else {
    console.error('❌ Error: google-services.json not found in any expected location');
    console.error('   Searched in:');
    possiblePaths.forEach(p => console.error(`     - ${p}`));
    console.error('   Please ensure google-services.json is committed to git');
    // Don't exit - let the build continue and see if expo-build-properties can handle it
    console.warn('⚠️  Continuing build - expo-build-properties may handle the file');
  }
}

// Also ensure it's copied to Android directories if they exist or will be created
const androidAppPath = path.join(__dirname, 'android', 'app', 'google-services.json');
const androidReleasePath = path.join(__dirname, 'android', 'app', 'src', 'release', 'google-services.json');

if (googleServicesContent) {
  // Always write to Android directories (they will be created during build)
  writeGoogleServices(googleServicesContent, androidAppPath);
  writeGoogleServices(googleServicesContent, androidReleasePath);
  console.log('✅ Copied google-services.json to Android directories');
} else {
  console.warn('⚠️  Skipping Android directory copy - expo-build-properties will handle it');
}

module.exports = appJson;

