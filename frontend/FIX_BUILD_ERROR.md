# Fix: google-services.json Missing During EAS Build

## Problem
Your EAS build is failing with:
```
File google-services.json is missing. The Google Services Plugin cannot function without it.
```

## Solution (Choose One)

### ✅ Solution 1: Commit File to Git (Quickest - Recommended First)

If you're using git-based builds, simply commit the file:

```bash
cd frontend
git add google-services.json
git commit -m "Add google-services.json for EAS builds"
git push
```

Then rebuild:
```bash
eas build --platform android --profile production
```

### ✅ Solution 2: Use EAS Secrets (More Secure)

1. **Create the EAS secret:**
   ```bash
   cd frontend
   eas secret:create --scope project --name GOOGLE_SERVICES_JSON --type string
   ```
   
   When prompted, paste the **entire content** of your `google-services.json` file (all the JSON).

2. **Update eas.json to use the secret:**
   
   The `eas.json` has been updated to use a pre-build hook that will automatically use the secret if available.

3. **Rebuild:**
   ```bash
   eas build --platform android --profile production
   ```

## What I've Set Up

✅ Created `eas-hooks/pre-build.sh` - This script will:
- Use `GOOGLE_SERVICES_JSON` secret if available
- Otherwise use the file from your repository
- Copy it to the correct Android directories

✅ Updated `eas.json` to run the pre-build hook

## Next Steps

1. **Try Solution 1 first** (commit to git) - it's the simplest
2. If that doesn't work or you prefer secrets, use **Solution 2**
3. Run your build again

## Verification

After applying either solution, the build should succeed. The pre-build hook will ensure `google-services.json` is in the right place during the build.

## Notes

- The `google-services.json` file is already in your `frontend/` directory
- It's not in `.gitignore`, so it can be committed
- The `app.json` correctly references `./google-services.json`
- The pre-build hook will handle copying it to the Android build directories



