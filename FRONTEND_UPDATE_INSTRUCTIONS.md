# 📱 Update Frontend to Use Railway Backend

## ✅ What I've Fixed

1. ✅ Fixed hardcoded `localhost:3000` in `pushNotificationService.js` - now uses `BASE_URL`
2. ✅ Updated `app.json` template with Railway URL placeholder
3. ✅ All API calls now use `BASE_URL` from `apiConfig.js`

## 🔧 Steps to Complete the Update

### Step 1: Get Your Railway Backend URL

1. Go to **Railway Dashboard**: https://railway.app
2. Click your **PROJECT**
3. Click your **SERVICE** (backend service)
4. Go to **"Settings"** tab
5. Scroll to **"Domains"** section
6. Copy your Railway URL (e.g., `https://your-service-name-production.up.railway.app`)

### Step 2: Update `frontend/app.json`

Open `frontend/app.json` and update the `apiBaseUrl`:

```json
"extra": {
  "env": "production",
  "apiBaseUrl": "https://YOUR_ACTUAL_RAILWAY_URL.railway.app/api",
  "eas": {
    "projectId": "08c39b17-d128-4aec-a952-96b678fd077d"
  }
}
```

**Important:**
- Replace `YOUR_ACTUAL_RAILWAY_URL` with your actual Railway domain
- Make sure it starts with `https://`
- Make sure it ends with `/api`

### Step 3: Commit Frontend Changes

Since frontend is a submodule, commit changes in the frontend directory:

```bash
cd frontend
git add app.json src/services/pushNotificationService.js
git commit -m "Update backend URL to Railway production"
git push
```

### Step 4: Rebuild Your App

After updating the URL, rebuild your Expo app:

**For Development:**
```bash
cd frontend
npx expo start --clear
```

**For Production Build:**
```bash
cd frontend
eas build --platform android
# or for iOS
eas build --platform ios
```

## 📋 Files Changed

1. `frontend/app.json` - Added `apiBaseUrl` in `extra` section
2. `frontend/src/services/pushNotificationService.js` - Fixed to use `BASE_URL` instead of hardcoded localhost

## ✅ Verification

After rebuilding:
1. Open your app
2. Try to login or make any API call
3. Check network requests - they should go to your Railway URL
4. Verify push notifications work

## 🎯 Current Status

- ✅ Backend is running on Railway
- ✅ Frontend code updated to use Railway URL
- ⏳ **You need to**: Update `app.json` with your actual Railway URL and rebuild



