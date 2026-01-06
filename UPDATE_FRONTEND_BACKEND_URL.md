# 🔄 Update Frontend to Use Railway Backend

## Step 1: Get Your Railway Backend URL

1. Go to **Railway Dashboard**: https://railway.app
2. Click on your **PROJECT**
3. Click on your **SERVICE** (backend service)
4. Go to **"Settings"** tab
5. Scroll down to **"Domains"** section
6. You should see a domain like: `your-service-name-production.up.railway.app`
7. **Copy this URL** (it should look like: `https://your-service-name-production.up.railway.app`)

## Step 2: Update app.json

1. Open `frontend/app.json`
2. Find the `"extra"` section
3. Replace `"https://YOUR_RAILWAY_URL.railway.app/api"` with your actual Railway URL
4. Make sure to include `/api` at the end

**Example:**
```json
"extra": {
  "env": "production",
  "apiBaseUrl": "https://your-service-name-production.up.railway.app/api",
  "eas": {
    "projectId": "08c39b17-d128-4aec-a952-96b678fd077d"
  }
}
```

## Step 3: Rebuild Your App

After updating the URL, you need to rebuild your Expo app:

### For Development:
```bash
cd frontend
npx expo start --clear
```

### For Production Build:
```bash
cd frontend
eas build --platform android
# or
eas build --platform ios
```

## Step 4: Verify It's Working

1. Open your app
2. Try to make an API call (e.g., login, fetch data)
3. Check the network requests in your app's debug console
4. Verify requests are going to your Railway URL, not localhost

## Important Notes

- The frontend will use the `apiBaseUrl` from `app.json` if set
- If not set, it falls back to localhost (for development)
- All API calls now use `BASE_URL` from `apiConfig.js`
- The hardcoded `localhost:3000` in `pushNotificationService.js` has been fixed

## Troubleshooting

If API calls fail:
1. Check that your Railway URL is correct (no typos)
2. Make sure the URL includes `https://` (not `http://`)
3. Make sure the URL ends with `/api`
4. Verify Railway service is running (check Railway dashboard)
5. Check Railway logs for any errors



