#!/bin/bash
# EAS Build Hook: Copy google-services.json to Android app directory
set -e

echo "📦 Copying google-services.json for Android build..."

# Ensure the android/app directory exists
mkdir -p android/app

# Copy google-services.json from root to android/app
if [ -f "google-services.json" ]; then
  cp google-services.json android/app/google-services.json
  echo "✅ Successfully copied google-services.json to android/app/"
else
  echo "❌ Error: google-services.json not found in root directory"
  exit 1
fi

# Also copy to release variant directory if it exists
if [ -d "android/app/src/release" ]; then
  cp google-services.json android/app/src/release/google-services.json
  echo "✅ Successfully copied google-services.json to android/app/src/release/"
fi

