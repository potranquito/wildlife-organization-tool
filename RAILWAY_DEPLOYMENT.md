# Railway Deployment Guide

This application requires **TWO separate Railway services** to work properly:

## Service 1: MCP Server (HTTP Gateway)

The MCP server provides wildlife data tools via HTTP endpoints.

### Setup:
1. Create a new Railway project called **wildlife-mcp-server**
2. Connect to this GitHub repository
3. Configure build settings:
   - **Root Directory**: `/` (repository root)
   - **Build Command**: `pnpm install`
   - **Start Command**: `npx tsx mcp-server/index.ts`
4. Set environment variables:
   ```
   OPENAI_API_KEY=your_openai_key_here
   IUCN_API_KEY=your_iucn_key_here (optional)
   PORT=3100
   ```
5. Deploy and note the public URL (e.g., `https://wildlife-mcp-server-production.up.railway.app`)

## Service 2: Next.js Application

The main web application that uses the MCP server.

### Setup:
1. Create a new Railway project called **wildlife-finder-app**
2. Connect to this GitHub repository
3. Use the existing `nixpacks.toml` configuration (already configured)
4. Set environment variables:
   ```
   OPENAI_API_KEY=your_openai_key_here
   VECTORIZE_TOKEN=your_vectorize_token_here (optional)
   IUCN_API_KEY=your_iucn_key_here (optional)
   MCP_SERVER_URL=https://wildlife-mcp-server-production.up.railway.app
   NODE_ENV=production
   ```
   ⚠️ **IMPORTANT**: Set `MCP_SERVER_URL` to the public URL from Service 1
5. Deploy

## Current Status

Your current deployment:
- **App URL**: https://wildlife-organization-tool-production.up.railway.app
- **Status**: ❌ Not working (needs MCP server)

## Quick Fix

**Option A: Deploy MCP Server Separately (Recommended)**
1. Create a new Railway service for the MCP server
2. Set `MCP_SERVER_URL` in the main app to point to it

**Option B: Single Service Deployment (Not Recommended)**
- Modify the code to bypass MCP and use direct API calls
- Less maintainable architecture
- Loses MCP benefits

## Testing MCP Server

Once deployed, test the MCP server:

```bash
# Health check
curl https://your-mcp-server.up.railway.app/health

# List available tools
curl https://your-mcp-server.up.railway.app/mcp/speciesFetcher/tools

# Test geocoding
curl -X POST https://your-mcp-server.up.railway.app/mcp/speciesFetcher/geocode_location \
  -H "Content-Type: application/json" \
  -d '{"locationQuery": "Miami, Florida"}'
```
