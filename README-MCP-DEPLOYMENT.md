# MCP Server Deployment Guide

This app uses a **hybrid architecture**:
- **Main app** on Vercel (serverless)
- **MCP servers** on Railway (persistent processes)

## Architecture

```
Vercel (Next.js)  ──HTTP──>  Railway (MCP Servers)
    │                             │
    ├─ API Routes                 ├─ Wikipedia MCP
    ├─ Frontend                   └─ Species Fetcher MCP
    └─ Environment: stdio (dev)
       Environment: HTTP (prod)
```

## Deployment Steps

### 1. Deploy MCP Server to Railway

1. **Create Railway Account**: https://railway.app
   - Sign in with GitHub

2. **Create New Project**:
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose `wildlife-finder` repository
   - Railway will auto-detect `railway.json`

3. **Add Environment Variables** (in Railway dashboard):
   ```
   OPENAI_API_KEY=your_openai_api_key
   VERCEL_APP_URL=https://wildlife-organization-tool.vercel.app
   PORT=3100
   ```

4. **Deploy**:
   - Railway will automatically deploy
   - Get your deployment URL: `https://your-app.railway.app`

### 2. Update Vercel Environment Variables

1. Go to **Vercel Dashboard** → Your Project → Settings → Environment Variables

2. Add new variable:
   ```
   MCP_SERVER_URL=https://your-app.railway.app
   ```

3. **Redeploy** your Vercel app for changes to take effect

### 3. Test the Integration

Test MCP server health:
```bash
curl https://your-app.railway.app/health
```

Expected response:
```json
{"status":"ok","timestamp":"2025-10-04T..."}
```

Test MCP tool call:
```bash
curl -X POST https://your-app.railway.app/mcp/wikipedia/search_wikipedia \
  -H "Content-Type: application/json" \
  -d '{"query":"Florida Panther","limit":3}'
```

## Local Development

For local development, MCP uses **stdio** (no Railway needed):

```bash
# Terminal 1: Run Next.js app
pnpm dev

# Terminal 2 (optional): Run standalone MCP server
pnpm mcp-server
```

MCP client automatically detects environment:
- **Development** (`localhost`): Uses stdio
- **Production** (Vercel): Uses HTTP to Railway

## Costs

- **Vercel**: Free (or existing plan)
- **Railway**:
  - Free tier: $5 credit/month
  - Paid: ~$5/month (500MB RAM, always-on)

## Troubleshooting

### Error: "Cannot find module './687.js'"
This happens when Vercel tries to run MCP servers locally.
- **Fix**: Set `MCP_SERVER_URL` in Vercel environment variables

### Error: "MCP HTTP Error: 500"
Railway MCP server is down or misconfigured.
- **Check**: Railway logs for errors
- **Verify**: Health endpoint works (`/health`)

### Error: "CORS policy"
Railway not configured to allow Vercel requests.
- **Fix**: Add `VERCEL_APP_URL` to Railway environment

## How It Works

### Development (stdio)
```typescript
// lib/mcp-client.ts
if (!IS_PRODUCTION) {
  // Spawn local MCP server process
  spawn('npx', ['tsx', 'mcp-servers/wikipedia/index.ts'])
}
```

### Production (HTTP)
```typescript
// lib/mcp-client.ts
if (IS_PRODUCTION) {
  // Call Railway MCP server via HTTP
  fetch('https://your-app.railway.app/mcp/wikipedia/search_wikipedia', {
    method: 'POST',
    body: JSON.stringify(args)
  })
}
```

## Environment Variables

### Vercel (.env.local on Vercel dashboard)
```bash
OPENAI_API_KEY=...
VECTORIZE_TOKEN=...
IUCN_API_KEY=...
MCP_SERVER_URL=https://your-app.railway.app  # Important!
```

### Railway
```bash
OPENAI_API_KEY=...
VERCEL_APP_URL=https://wildlife-organization-tool.vercel.app
PORT=3100
```

## MCP Server Endpoints

- `GET /health` - Health check
- `GET /mcp/:server/tools` - List available tools
- `POST /mcp/:server/:tool` - Call a tool

Available servers: `wikipedia`, `speciesFetcher`

Example tools:
- `wikipedia/search_wikipedia`
- `wikipedia/get_wikipedia_summary`
- `speciesFetcher/geocode_location`
- `speciesFetcher/find_species_by_location`
- `speciesFetcher/search_conservation_organizations`
