# Full Screen Implementation

This document describes the full screen implementation for Android devices in the SynchroGate app.

## Overview

The app has been configured to run in full screen mode on Android devices, extending all the way to the notification bar at the top and the navigation bar at the bottom.

## Implementation Details

### 1. Android Styles Configuration (`android/app/src/main/res/values/styles.xml`)

- Set `android:statusBarColor` to transparent
- Set `android:navigationBarColor` to transparent
- Enabled `android:windowTranslucentStatus` and `android:windowTranslucentNavigation`
- Set `android:windowFullscreen` to true
- Added `android:windowLayoutInDisplayCutoutMode` for modern devices with notches

### 2. React Native StatusBar Configuration (`App.js`)

- Configured StatusBar with `translucent={true}` and `backgroundColor="transparent"`
- Added Platform-specific imports for Android handling
- Created a FullScreenWrapper component for consistent behavior

### 3. Native Android Activity Configuration

#### Java MainActivity (`android/app/src/main/java/com/guardientryapp/MainActivity.java`)
- Implemented `enableFullScreenMode()` method
- Set system UI flags for immersive mode
- Configured edge-to-edge display

#### Kotlin MainActivity (`android/app/src/main/java/com/pmftici/guardientry/MainActivity.kt`)
- Added full screen mode configuration
- Implemented proper system UI visibility flags
- Set transparent status and navigation bars

### 4. Utility Components

#### FullScreenWrapper (`src/components/FullScreenWrapper.js`)
- Reusable component for ensuring full screen mode
- Handles StatusBar configuration consistently
- Can be used across different screens

#### Full Screen Utils (`src/utils/fullScreenUtils.js`)
- Utility functions for full screen management
- Platform-specific implementations
- StatusBar height calculations

## Usage

The full screen mode is automatically enabled when the app starts. All screens will display in full screen mode by default.

### Manual Control

If you need to control full screen mode manually:

```javascript
import { configureFullScreen, hideStatusBar, showStatusBar } from './src/utils/fullScreenUtils';

// Configure full screen mode
configureFullScreen();

// Hide status bar
hideStatusBar();

// Show status bar
showStatusBar();
```

### Using FullScreenWrapper

Wrap any component that needs full screen behavior:

```javascript
import FullScreenWrapper from './src/components/FullScreenWrapper';

<FullScreenWrapper statusBarStyle="light-content">
  <YourComponent />
</FullScreenWrapper>
```

## Testing

To test the full screen implementation:

1. Run the app on an Android device: `npm run android`
2. Verify that the app extends to the very top of the screen (notification bar area)
3. Check that the app extends to the bottom navigation bar area
4. Test on different Android versions and screen sizes

## Notes

- The implementation uses both Java and Kotlin MainActivity files to ensure compatibility
- Edge-to-edge display is enabled for modern Android devices
- The app handles devices with notches and cutouts properly
- Status bar content remains visible but the app draws behind it
