# Setting Up Expo Project Under "Awds" Account

## Issue
The "Awds" account doesn't have permission to create projects via CLI. This usually means:
- The account needs verification
- The account may need an EAS subscription (free tier should work, but account might need setup)

## Solution: Create Project via Web Dashboard

### Step 1: Create Project on Expo Dashboard
1. Go to https://expo.dev and log in as "Awds" (username: `Awds`, password: `Chosanaosama2004`)
2. Navigate to: https://expo.dev/accounts/Awds/projects
3. Click **"Create a project"** or **"New Project"**
4. Select **"For an existing codebase"**
5. Fill in:
   - **Name**: `SynchroGate`
   - **Slug**: `synchrogate` (must match your app.json slug)
6. Click **"Create"**
7. **Copy the Project ID** from the project page (it will look like: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

### Step 2: Link Local Project to Expo Project
Once you have the Project ID from the dashboard:

1. Open `app.json` and add the project ID:
```json
"extra": {
  "env": "production",
  "apiBaseUrl": "https://synchrogate-production.up.railway.app/api",
  "eas": {
    "projectId": "YOUR_PROJECT_ID_HERE"
  }
},
"owner": "Awds"
```

2. Or run this command (replace YOUR_PROJECT_ID with the actual ID):
```bash
cd frontend
eas init --id YOUR_PROJECT_ID
```

### Step 3: Verify and Build
```bash
eas whoami  # Should show "awds"
eas build:configure  # Verify configuration
npm run build:android  # Build your app
```

## Alternative: If Web Dashboard Also Fails

If you can't create a project via the web dashboard either, the account may need:
1. **Email verification** - Check your email for verification link
2. **Account activation** - Contact Expo support
3. **EAS Plan** - Free tier should work, but account might need initial setup

## Check Account Status
Visit: https://expo.dev/accounts/Awds/settings
- Verify email is confirmed
- Check if there are any account restrictions
- Ensure the account is active





