# Complete Fix for google-services.json Build Error

## ✅ What I've Fixed

1. ✅ Created `app.config.js` - Dynamically writes `google-services.json` from EAS secret or uses existing file
2. ✅ Updated `eas.json` - Added `GOOGLE_SERVICES_JSON` environment variable reference
3. ✅ Created setup script - `scripts/setup-google-services.js` as backup

## 🚀 Quick Setup (Choose One Method)

### Method 1: Use EAS Secret (Recommended)

1. **Create the EAS secret:**
   ```bash
   cd frontend
   eas secret:create --scope project --name GOOGLE_SERVICES_JSON --type string
   ```
   
   When prompted, paste the **entire content** of your `google-services.json` file:
   ```json
   {
     "project_info": {
       "project_number": "149886535931",
       "project_id": "guardientry-database",
       ...
     },
     ...
   }
   ```

2. **Rebuild:**
   ```bash
   npm run build:android
   ```

### Method 2: Commit File to Git (Simpler, but less secure)

1. **Add and commit the file:**
   ```bash
   cd frontend
   git add google-services.json
   git commit -m "Add google-services.json for EAS builds"
   git push
   ```

2. **Rebuild:**
   ```bash
   npm run build:android
   ```

## 🔧 How It Works

### app.config.js
- Runs before every Expo build
- If `GOOGLE_SERVICES_JSON` secret exists, writes it to `google-services.json`
- If secret doesn't exist but file exists in repo, uses that
- Automatically copies file to Android build directories

### eas.json
- References the `GOOGLE_SERVICES_JSON` secret using `@GOOGLE_SERVICES_JSON`
- Makes the secret available as an environment variable during builds

## 📋 Verification Steps

1. **Check if secret exists:**
   ```bash
   eas secret:list
   ```
   You should see `GOOGLE_SERVICES_JSON` in the list.

2. **Verify app.config.js:**
   ```bash
   node -e "require('./app.config.js')"
   ```
   Should run without errors.

3. **Test build:**
   ```bash
   npm run build:android
   ```

## 🐛 Troubleshooting

### Error: "GOOGLE_SERVICES_JSON secret not found"
- Make sure you created the secret: `eas secret:create --scope project --name GOOGLE_SERVICES_JSON --type string`
- Verify it exists: `eas secret:list`

### Error: "google-services.json is missing"
- If using Method 1 (EAS Secret): The secret should be automatically written by `app.config.js`
- If using Method 2 (Git): Make sure the file is committed: `git ls-files | grep google-services.json`

### Build still fails
1. Check that `app.config.js` exists and is valid
2. Verify `eas.json` has the environment variable reference
3. Try clearing EAS cache and rebuilding

## 📝 File Locations

- `app.config.js` - Dynamic config that writes google-services.json
- `eas.json` - EAS build configuration with secret reference
- `scripts/setup-google-services.js` - Backup script (not needed if using app.config.js)
- `google-services.json` - Your Firebase config file (should be in git or secret)

## ✅ Next Steps

1. **Choose your method** (EAS Secret recommended)
2. **Set up the secret or commit the file**
3. **Run the build:**
   ```bash
   npm run build:android
   ```

The build should now succeed! 🎉



































































