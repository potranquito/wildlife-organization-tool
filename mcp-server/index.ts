#!/usr/bin/env node
/**
 * MCP Server HTTP Gateway
 *
 * Provides HTTP/SSE endpoints for Wikipedia and Species Fetcher MCP servers
 * Designed for production deployment on Railway/VPS while main app runs on Vercel
 */

import express from 'express';
import cors from 'cors';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

const app = express();
const PORT = process.env.PORT || 3100;

// Enable CORS for Vercel app
const allowedOrigins = [
  'https://wildlife-organization-tool.vercel.app',
  'http://localhost:3000',
  'http://localhost:3002'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all for now, can restrict later
    }
  },
  credentials: true
}));

app.use(express.json());

// MCP Client manager for stdio connections
class MCPManager {
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, StdioClientTransport> = new Map();

  async getClient(serverName: 'wikipedia' | 'speciesFetcher'): Promise<Client> {
    if (this.clients.has(serverName)) {
      return this.clients.get(serverName)!;
    }

    const config = {
      wikipedia: {
        command: 'npx',
        args: ['tsx', 'mcp-servers/wikipedia/index.ts']
      },
      speciesFetcher: {
        command: 'npx',
        args: ['tsx', 'mcp-servers/species-fetcher/index.ts']
      }
    }[serverName];

    console.log(`🔌 Connecting to ${serverName} MCP server...`);

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      stderr: 'pipe'
    });

    const client = new Client(
      {
        name: `mcp-http-gateway-${serverName}`,
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    await client.connect(transport);
    console.log(`✅ Connected to ${serverName} MCP server`);

    this.clients.set(serverName, client);
    this.transports.set(serverName, transport);

    return client;
  }

  async cleanup() {
    for (const [name, transport] of this.transports) {
      try {
        await transport.close();
        console.log(`🔌 Disconnected ${name} MCP server`);
      } catch (error) {
        console.error(`Error disconnecting ${name}:`, error);
      }
    }
    this.clients.clear();
    this.transports.clear();
  }
}

const mcpManager = new MCPManager();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// MCP tool call endpoint
app.post('/mcp/:server/:tool', async (req, res) => {
  const { server, tool } = req.params;
  const args = req.body;

  console.log(`📞 MCP Call: ${server}.${tool}`, args);

  try {
    const client = await mcpManager.getClient(server as any);

    const response = await client.callTool({
      name: tool,
      arguments: args
    });

    const content = (response.content as any)?.[0];

    if (!content) {
      throw new Error('No content in response');
    }

    let result;
    if (content.type === 'text') {
      try {
        result = JSON.parse(content.text);
      } catch {
        result = content.text;
      }
    } else {
      result = content;
    }

    console.log(`✅ MCP Success: ${server}.${tool}`);
    res.json({ success: true, data: result });

  } catch (error: any) {
    console.error(`❌ MCP Error: ${server}.${tool}:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      tool: `${server}.${tool}`
    });
  }
});

// List available tools
app.get('/mcp/:server/tools', async (req, res) => {
  const { server } = req.params;

  try {
    const client = await mcpManager.getClient(server as any);
    const tools = await client.listTools();

    res.json({
      success: true,
      server,
      tools: tools.tools
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Cleanup on exit
process.on('SIGTERM', async () => {
  console.log('Shutting down MCP servers...');
  await mcpManager.cleanup();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down MCP servers...');
  await mcpManager.cleanup();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 MCP HTTP Gateway running on port ${PORT}`);
  console.log(`📡 Available endpoints:`);
  console.log(`   - GET  /health`);
  console.log(`   - GET  /mcp/:server/tools`);
  console.log(`   - POST /mcp/:server/:tool`);
  console.log(`\n🔧 Available MCP servers: wikipedia, speciesFetcher`);
});
