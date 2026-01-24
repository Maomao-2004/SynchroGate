#!/bin/bash

# Production Build Script for SyncroGate
# This script helps build the app for production

echo "🚀 SyncroGate Production Build Script"
echo "======================================"
echo ""

# Check if EAS CLI is installed
if ! command -v eas &> /dev/null; then
    echo "❌ EAS CLI is not installed."
    echo "📦 Installing EAS CLI..."
    npm install -g eas-cli
fi

# Check if user is logged in
echo "🔐 Checking EAS login status..."
if ! eas whoami &> /dev/null; then
    echo "⚠️  Not logged in to EAS. Please login:"
    eas login
fi

echo ""
echo "Select build platform:"
echo "1) Android (APK)"
echo "2) iOS"
echo "3) Both platforms"
echo "4) Preview build (Android)"
read -p "Enter choice [1-4]: " choice

case $choice in
    1)
        echo "📱 Building Android APK for production..."
        eas build --platform android --profile production
        ;;
    2)
        echo "🍎 Building iOS for production..."
        eas build --platform ios --profile production
        ;;
    3)
        echo "📱🍎 Building for both platforms..."
        eas build --platform all --profile production
        ;;
    4)
        echo "📱 Building Android preview build..."
        eas build --platform android --profile preview
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "✅ Build process started!"
echo "📊 Monitor your build at: https://expo.dev"
echo ""
echo "💡 Tips:"
echo "   - Builds typically take 10-20 minutes"
echo "   - You'll receive a download link when complete"
echo "   - Check build status: eas build:list"































































































