# 🔧 Vercel Deployment Fix Guide

## Issue Diagnosis
Your wildlife finder is failing in Vercel production due to environment variable configuration issues.

## Critical Environment Variables
Your app ONLY requires:
```
OPENAI_API_KEY=your_openai_api_key_here
```

## Vercel Dashboard Fix

### Step 1: Clean Environment Variables
1. Go to your Vercel project dashboard
2. Navigate to Settings → Environment Variables
3. **DELETE ALL existing environment variables**
4. Add ONLY this one variable:
   - **Key:** `OPENAI_API_KEY`
   - **Value:** Your OpenAI API key (starts with `sk-proj-`)
   - **Environment:** Production, Preview, Development (check all)

### Step 2: Redeploy
1. Go to Deployments tab
2. Click "Redeploy" on the latest deployment
3. OR trigger a new deployment by pushing to your main branch

## Common Issues to Avoid

### ❌ Don't Add These to Vercel:
- `MIN_LOADING_TIME` (optional, has defaults)
- `POEM_DELAY` (optional, has defaults)
- `MAX_DISPLAYED_SPECIES` (optional, has defaults)
- `NODE_ENV` (Vercel sets this automatically)

### ✅ Vercel Environment Best Practices:
- Only add variables that don't have defaults
- Use the exact same API key format as local
- Set for all environments (Production, Preview, Development)

## Test Your Deployment

After redeployment, test with:
```bash
curl -X POST https://your-vercel-url.vercel.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "miami", "sessionId": "test"}'
```

Expected response: Disambiguation options for Miami

## If Still Failing

Check Vercel Function Logs:
1. Go to Functions tab in Vercel dashboard
2. Click on `/api/chat`
3. View recent invocations and error logs
4. Look for "OPENAI_API_KEY environment variable is not set" errors

## Alternative: Use Vercel CLI

```bash
# Link your project (run once)
vercel link

# Add environment variable via CLI
vercel env add OPENAI_API_KEY

# Deploy
vercel --prod
```

## Quick Verification

Your local version works because `.env.local` has the API key.
Vercel needs the SAME key in the dashboard environment variables.

The key should be the EXACT same value as in your `.env.local` file.