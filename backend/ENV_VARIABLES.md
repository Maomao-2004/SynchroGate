# Required Environment Variables for Railway

## ⚠️ CRITICAL: Set These in Railway Dashboard

Go to: **Railway Dashboard → Your Service → Variables Tab**

### Required Variables (Must Have):

```
FIREBASE_SERVICE_ACCOUNT_JSON
```
**Value**: Your entire Firebase service account JSON as a **single-line string**
- Get it from Firebase Console → Project Settings → Service Accounts
- Click "Generate new private key"
- Copy the entire JSON object
- Paste it as a **single line** (remove all line breaks)
- Example format: `{"type":"service_account","project_id":"your-project",...}`

```
FIREBASE_DATABASE_URL
```
**Value**: Your Firebase Realtime Database URL
- Format: `https://your-project-id.firebaseio.com`
- Or: `https://your-project-id-default-rtdb.firebaseio.com`

```
JWT_SECRET
```
**Value**: A random secret string for JWT tokens
- Generate a strong random string (at least 32 characters)
- Example: `your-super-secret-jwt-key-here-12345`

### Optional Variables (Can Set Later):

```
NODE_ENV=production
PORT=8000
JWT_EXPIRES_IN=7d
BCRYPT_SALT_ROUNDS=10
APP_BASE_URL=https://your-app.railway.app
FRONTEND_URL=https://your-frontend-url.com
EXPO_PUSH_KEY=
TWILIO_SID=
TWILIO_TOKEN=
TWILIO_FROM=
```

## How to Set in Railway

1. Go to Railway Dashboard
2. Click your service
3. Click **"Variables"** tab
4. Click **"New Variable"**
5. Enter variable name and value
6. Click **"Add"**
7. **Redeploy** your service

## After Setting Variables

1. The logs will now show clear error messages if something is missing
2. Look for:
   - `✅ Firebase module loaded` - Good!
   - `❌ Missing required environment variable: X` - Set this variable!
   - `🚀 Server running on port XXXX` - Success!

## Troubleshooting

**If you see "Missing required env var":**
- Check that the variable name is spelled exactly (case-sensitive)
- Make sure there are no extra spaces
- Verify the value is set

**If you see "Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON":**
- Make sure it's valid JSON
- It should be a single line (no line breaks)
- Start with `{` and end with `}`

























