# Fix for "Malformed root json" Error

## Problem
The build is failing with:
```
Malformed root json at /home/expo/workingdir/build/frontend/android/app/src/release/google-services.json
```

## Cause
The `google-services.json` file is being created from the EAS secret, but the JSON content might be:
- Invalid JSON format
- Has extra whitespace or characters
- Not properly formatted

## Solution

I've updated `app.config.js` to:
1. ✅ Parse and validate JSON before writing
2. ✅ Format JSON properly with 2-space indentation
3. ✅ Ensure valid JSON structure

## Next Steps

### Option 1: Verify and Update EAS Secret

1. **Check the current secret:**
   ```bash
   eas secret:list
   ```

2. **Get your google-services.json content:**
   ```bash
   cat frontend/google-services.json
   ```

3. **Update the secret with clean JSON:**
   ```bash
   cd frontend
   eas secret:delete --scope project --name GOOGLE_SERVICES_JSON
   eas secret:create --scope project --name GOOGLE_SERVICES_JSON --type string
   ```
   
   When prompted, paste the **exact content** from your `google-services.json` file. Make sure:
   - It's valid JSON (you can validate at jsonlint.com)
   - No extra characters before or after
   - Properly formatted

4. **Rebuild:**
   ```bash
   npm run build:android
   ```

### Option 2: Use the File from Git (Simpler)

If the secret keeps causing issues, just commit the file:

```bash
cd frontend
git add google-services.json
git commit -m "Add google-services.json"
git push
```

Then remove the secret reference from `eas.json` (remove the `GOOGLE_SERVICES_JSON` line), and the build will use the file from git.

## Verification

The updated `app.config.js` will now:
- Parse the JSON to ensure it's valid
- Format it properly
- Write it to all required locations

If you still get the error, the issue is with the JSON content in your EAS secret. Make sure it's valid JSON when you paste it.

## Quick Test

You can test if your JSON is valid:
```bash
node -e "JSON.parse(require('fs').readFileSync('frontend/google-services.json', 'utf8')); console.log('✅ Valid JSON')"
```

If this fails, your JSON file has issues that need to be fixed first.



































































