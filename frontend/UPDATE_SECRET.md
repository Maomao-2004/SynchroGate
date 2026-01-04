# Update Existing GOOGLE_SERVICES_JSON Secret

The secret already exists! You need to **update** it, not create a new one.

## Update the Existing Secret

Run this command:

```bash
cd frontend
eas env:update GOOGLE_SERVICES_JSON
```

When prompted, paste this JSON (the entire content):

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

## Alternative: Delete and Recreate

If update doesn't work, delete and recreate:

```bash
# Delete the existing one
eas env:delete GOOGLE_SERVICES_JSON

# Create new one
eas env:create GOOGLE_SERVICES_JSON
```

Then paste the JSON when prompted.

## After Updating

Once the secret is updated, rebuild:

```bash
npm run build:android
```

