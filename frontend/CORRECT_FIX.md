# Correct Fix for google-services.json Build Error

## ✅ Fixed: Removed Invalid `hooks` Field

The `hooks` field is not supported in `eas.json`. I've removed it.

## Solution: Commit google-services.json to Git

For EAS builds, the `google-services.json` file must be in your git repository so it's available during the build process.

### Steps:

1. **Navigate to frontend directory:**
   ```bash
   cd frontend
   ```

2. **Check if file is already tracked:**
   ```bash
   git status google-services.json
   ```

3. **Add and commit the file:**
   ```bash
   git add google-services.json
   git commit -m "Add google-services.json for EAS builds"
   git push
   ```

4. **Rebuild your app:**
   ```bash
   eas build --platform android --profile production
   ```

## Why This Works

- EAS builds use your git repository as the source
- The `google-services.json` file in the root of your `frontend/` directory will be included
- Expo's build process will automatically copy it to the correct Android directories based on your `app.json` configuration

## Alternative: Use EAS Secrets (If you can't commit the file)

If you prefer not to commit the file to git:

1. **Create an EAS secret:**
   ```bash
   cd frontend
   eas secret:create --scope project --name GOOGLE_SERVICES_JSON --type string
   ```
   Paste the entire JSON content when prompted.

2. **Create a script to write the file during build:**
   
   Create `scripts/write-google-services.js`:
   ```javascript
   const fs = require('fs');
   const secret = process.env.GOOGLE_SERVICES_JSON;
   if (secret) {
     fs.writeFileSync('google-services.json', secret);
     console.log('✅ Created google-services.json from secret');
   }
   ```

3. **Update package.json to run the script:**
   ```json
   {
     "scripts": {
       "prebuild": "node scripts/write-google-services.js"
     }
   }
   ```

4. **Update eas.json to use the secret:**
   ```json
   {
     "build": {
       "production": {
         "env": {
           "EXPO_PUBLIC_ENV": "production",
           "GOOGLE_SERVICES_JSON": "@GOOGLE_SERVICES_JSON"
         }
       }
     }
   }
   ```

However, **committing to git is simpler and recommended** unless you have security concerns.

## Verification

After committing the file, verify it's tracked:
```bash
git ls-files | grep google-services.json
```

You should see `google-services.json` in the output.

Then rebuild:
```bash
eas build --platform android --profile production
```

The build should now succeed! 🎉

