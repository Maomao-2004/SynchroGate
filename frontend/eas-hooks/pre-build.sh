#!/bin/bash
# EAS Build Hook: Setup google-services.json from secret or file
set -e

echo "📦 Setting up google-services.json for Android build..."

# If GOOGLE_SERVICES_JSON secret is set, use it
if [ -n "$GOOGLE_SERVICES_JSON" ]; then
  echo "$GOOGLE_SERVICES_JSON" > google-services.json
  echo "✅ Created google-services.json from EAS secret"
elif [ -f "google-services.json" ]; then
  echo "✅ Using existing google-services.json file"
else
  echo "❌ Error: google-services.json not found and GOOGLE_SERVICES_JSON secret not set"
  echo "Please either:"
  echo "  1. Commit google-services.json to your git repository, or"
  echo "  2. Set GOOGLE_SERVICES_JSON as an EAS secret"
  exit 1
fi

# Ensure the android/app directory exists and copy file there
mkdir -p android/app
cp google-services.json android/app/google-services.json
echo "✅ Copied google-services.json to android/app/"

# Also copy to release variant directory
mkdir -p android/app/src/release
cp google-services.json android/app/src/release/google-services.json
echo "✅ Copied google-services.json to android/app/src/release/"



































































