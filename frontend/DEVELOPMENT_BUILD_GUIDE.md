# 🚀 Development Build Guide - Push Notifications Work!

## ✅ Yes, Push Notifications Work in Development Builds!

Development builds (custom dev client) **DO support FCM push notifications** because they include native modules. This is different from Expo Go, which doesn't support FCM.

## Quick Start

### 1. Build Development APK (One Time)

```bash
cd frontend
npm run build:dev
```

Or use EAS directly:
```bash
eas build --platform android --profile development
```

### 2. Install the Development Build

- Download the APK from EAS dashboard
- Install it on your device
- This is your "custom dev client" - it looks like Expo Go but includes native modules

### 3. Start Development Server

```bash
npm start
```

Then:
- Press `a` to open on Android
- The app will connect to your dev server
- You can hot reload, see errors, etc.

### 4. Push Notifications Work!

- FCM is fully functional in development builds
- You can test push notifications without building production
- All native features work (camera, notifications, etc.)

## Differences: Development vs Production

| Feature | Development Build | Production Build |
|---------|------------------|------------------|
| FCM Push Notifications | ✅ **Works** | ✅ Works |
| Hot Reload | ✅ Yes | ❌ No |
| Dev Tools | ✅ Yes | ❌ No |
| Native Modules | ✅ Included | ✅ Included |
| Build Time | ~10-15 min | ~15-20 min |
| APK Size | Larger (includes dev tools) | Smaller (optimized) |

## When to Use Development Builds

✅ **Use Development Builds When:**
- Testing features during development
- Debugging native modules (like FCM)
- Want hot reload with native features
- Don't want to rebuild production every time

✅ **Use Production Builds When:**
- Ready to release
- Need optimized APK size
- Testing final release version

## Important Notes

1. **One Development Build = Many Sessions**
   - Build once, use for weeks/months
   - Only rebuild if you add new native dependencies

2. **Development Build Includes:**
   - All native modules (FCM, camera, etc.)
   - Dev tools and debugging
   - Hot reload support

3. **Push Notifications:**
   - Work exactly like production
   - Use same FCM tokens
   - Same backend integration

## Troubleshooting

### "FCM not available" in Development Build
- Make sure you built with `--profile development`
- Check that `google-services.json` is in the project
- Rebuild if you just added FCM dependencies

### Can't Connect to Dev Server
- Make sure device and computer are on same WiFi
- Check firewall settings
- Try `expo start --tunnel`

## Commands Summary

```bash
# Build development APK (one time)
npm run build:dev

# Start dev server (every time you code)
npm start

# Build production APK (when ready to release)
npm run build:android
```

## 🎉 Benefits

- ✅ Test push notifications without production builds
- ✅ Hot reload with native features
- ✅ Faster iteration cycle
- ✅ Same FCM functionality as production

