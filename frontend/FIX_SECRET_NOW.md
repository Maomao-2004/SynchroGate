# Fix: Secret Contains Placeholder Instead of JSON

## Problem
Your EAS secret `GOOGLE_SERVICES_JSON` contains the placeholder text `@GOOGLE_SERVICES_JSON` instead of the actual JSON content.

## Solution: Update the Secret with Real JSON

### Step 1: Delete the incorrect secret
```bash
cd frontend
eas env:delete GOOGLE_SERVICES_JSON
```

### Step 2: Create it again with the actual JSON
```bash
eas env:create GOOGLE_SERVICES_JSON
```

### Step 3: When prompted, paste THIS ENTIRE JSON:

```json
{
  "project_info": {
    "project_number": "149886535931",
    "project_id": "guardientry-database",
    "storage_bucket": "guardientry-database.firebasestorage.app"
  },
  "client": [
    {
      "client_info": {
        "mobilesdk_app_id": "1:149886535931:android:243864d268dc9f2969085e",
        "android_client_info": {
          "package_name": "com.palabay.synchrogate"
        }
      },
      "oauth_client": [],
      "api_key": [
        {
          "current_key": "AIzaSyCdA0Z1u6yVAvIxwWoehTVyLIBzfCV9VTY"
        }
      ],
      "services": {
        "appinvite_service": {
          "other_platform_oauth_client": []
        }
      }
    }
  ],
  "configuration_version": "1"
}
```

**IMPORTANT:**
- Copy the ENTIRE JSON above (from `{` to `}`)
- Make sure there are NO extra characters
- Paste it when the command asks for the secret value

### Step 4: Rebuild
```bash
npm run build:android
```

## Alternative: Use File from Git (Simpler)

If you keep having issues with the secret, just commit the file:

1. **Restore the actual google-services.json file** (get it from Firebase Console or use the JSON above)

2. **Save it to the file:**
   ```bash
   # Create the file with the JSON content
   # (You can copy the JSON above and save it as google-services.json)
   ```

3. **Commit it:**
   ```bash
   git add google-services.json
   git commit -m "Add google-services.json"
   git push
   ```

4. **Remove the secret reference from eas.json** - Remove the `GOOGLE_SERVICES_JSON` line from the env section

5. **Rebuild:**
   ```bash
   npm run build:android
   ```



























































































