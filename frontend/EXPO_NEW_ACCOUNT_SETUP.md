# Building SyncroGate with a New Expo Account

This guide will walk you through setting up and building the SyncroGate project with a new Expo account.

## Prerequisites

1. **New Expo Account**: Make sure you have created a new Expo account at [expo.dev](https://expo.dev)
2. **EAS CLI**: Ensure you have EAS CLI installed globally:
   ```bash
   npm install -g eas-cli
   ```

## Step-by-Step Instructions

### Step 1: Navigate to Frontend Directory
```bash
cd frontend
```

### Step 2: Log Out of Current Expo Account (if logged in)
```bash
eas logout
```

### Step 3: Log In to Your New Expo Account
```bash
eas login
```
Enter your new Expo account credentials when prompted.

### Step 4: Link Project to New Account
This will create a new project in your Expo account and generate a new projectId:
```bash
eas init
```
- When prompted, choose to create a new project
- Select your organization/account
- This will automatically update `app.json` with a new `projectId` in the `extra.eas` section

### Step 5: Verify Configuration
After running `eas init`, check that `app.json` now has a new `projectId`:
```json
"extra": {
  "env": "production",
  "apiBaseUrl": "https://synchrogate-production.up.railway.app/api",
  "eas": {
    "projectId": "<new-project-id>"
  }
}
```

### Step 6: Configure EAS Build (if needed)
If you need to configure build settings, you can run:
```bash
eas build:configure
```
This will help you set up build profiles for Android/iOS.

### Step 7: Build Your App

#### For Android:
```bash
npm run build:android
```
or
```bash
eas build --platform android --profile production
```

#### For iOS:
```bash
npm run build:ios
```
or
```bash
eas build --platform ios --profile production
```

#### For Both Platforms:
```bash
npm run build:all
```
or
```bash
eas build --platform all --profile production
```

#### For Preview/Testing (Android APK):
```bash
npm run build:preview
```
or
```bash
eas build --platform android --profile preview
```

## Build Profiles Available

Based on your `eas.json`, you have these build profiles:

1. **development**: Development client build for internal distribution
2. **preview**: Preview build (APK for Android) for internal testing
3. **production**: Production build with auto-increment versioning
4. **apk**: Android APK build

## Important Notes

1. **Project ID**: The projectId has been removed from `app.json`. It will be automatically added when you run `eas init` with your new account.

2. **Bundle Identifiers**: Your current bundle identifiers are:
   - iOS: `com.palabay.synchrogate`
   - Android: `com.palabay.synchrogate`
   
   If you need to change these for the new account, update them in `app.json` before building.

3. **Google Services**: Make sure you have the correct `google-services.json` and `GoogleService-Info.plist` files configured for your Firebase project.

4. **API URL**: The current API URL is set to `https://synchrogate-production.up.railway.app/api`. Update this in `app.json` if needed.

## Troubleshooting

### If `eas init` fails:
- Make sure you're logged in: `eas whoami`
- Check your internet connection
- Try logging out and back in: `eas logout && eas login`

### If build fails:
- Check that all dependencies are installed: `npm install`
- Verify your `eas.json` configuration
- Check the build logs on [expo.dev](https://expo.dev)

### If you need to change bundle identifiers:
Update the `bundleIdentifier` (iOS) and `package` (Android) in `app.json` before running `eas init`.

## Next Steps After Building

1. **Download Build**: Once the build completes, you can download it from the Expo dashboard or use the provided URL.

2. **Submit to Stores** (optional):
   ```bash
   npm run submit:android  # For Google Play Store
   npm run submit:ios       # For App Store
   ```

3. **Update App**: For future updates, you can use OTA updates with `eas update`.

## Additional Resources

- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [EAS CLI Reference](https://docs.expo.dev/eas/eas-cli/)
- [Expo Dashboard](https://expo.dev)

























