# 🚂 Railway URL Format - Exact Value to Put

## Exact Format for `apiBaseUrl` in `frontend/app.json`

Replace the placeholder in `frontend/app.json` with your actual Railway URL using this format:

### Format 1 (Most Common):
```
https://[YOUR-SERVICE-NAME]-[BRANCH].up.railway.app/api
```

**Example:**
```
https://syncrogate-backend-production.up.railway.app/api
```

### Format 2 (Alternative):
```
https://[YOUR-SERVICE-NAME].railway.app/api
```

**Example:**
```
https://syncrogate-backend.railway.app/api
```

## How to Find Your Exact Railway URL

1. **Go to Railway Dashboard**: https://railway.app
2. **Click your PROJECT**
3. **Click your SERVICE** (the backend service)
4. **Go to "Settings" tab**
5. **Scroll to "Domains" section**
6. **Copy the domain** (it will look like one of the formats above)
7. **Add `/api` at the end**

## Example Values

If your Railway domain is:
- `syncrogate-backend-production.up.railway.app` → Use: `https://syncrogate-backend-production.up.railway.app/api`
- `guardientry-backend.up.railway.app` → Use: `https://guardientry-backend.up.railway.app/api`
- `my-service.railway.app` → Use: `https://my-service.railway.app/api`

## Important Notes

- ✅ Always start with `https://`
- ✅ Always end with `/api`
- ✅ No trailing slash after `/api`
- ✅ Replace `[YOUR-SERVICE-NAME]` and `[BRANCH]` with your actual values
- ✅ The domain is case-sensitive

## Where to Update

File: `frontend/app.json`
Line: 68
Field: `"apiBaseUrl"` in `"extra"` section





