/**
 * MCP Client for Wildlife-Finder
 *
 * Supports both stdio (development) and HTTP (production) transports
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Environment detection
const IS_PRODUCTION = process.env.VERCEL || process.env.NODE_ENV === 'production';
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3100';

console.log(`🌍 MCP Mode: ${IS_PRODUCTION ? 'HTTP (Production)' : 'stdio (Development)'}`);
if (IS_PRODUCTION) {
  console.log(`📡 MCP Server URL: ${MCP_SERVER_URL}`);
}

// MCP Server configurations for stdio (development)
interface MCPServerConfig {
  command: string;
  args: string[];
}

const MCP_SERVERS: Record<string, MCPServerConfig> = {
  wikipedia: {
    command: 'npx',
    args: ['tsx', 'mcp-servers/wikipedia/index.ts'],
  },
  speciesFetcher: {
    command: 'npx',
    args: ['tsx', 'mcp-servers/species-fetcher/index.ts'],
  },
};

// MCP Client manager with dual transport support
class MCPClientManager {
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, StdioClientTransport> = new Map();

  /**
   * Call a tool via HTTP (production mode)
   */
  private async callToolHTTP(
    serverName: string,
    toolName: string,
    args: Record<string, any>
  ): Promise<any> {
    console.log(`📞 HTTP MCP Call: ${serverName}.${toolName}`);

    const response = await fetch(`${MCP_SERVER_URL}/mcp/${serverName}/${toolName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`MCP HTTP Error: ${error.error || response.statusText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(`MCP Call Failed: ${result.error}`);
    }

    console.log(`✅ HTTP MCP Success: ${serverName}.${toolName}`);
    return result.data;
  }

  /**
   * Connect to an MCP server via stdio (development mode)
   */
  private async connect(serverName: keyof typeof MCP_SERVERS): Promise<Client> {
    // Return existing client if already connected
    if (this.clients.has(serverName)) {
      return this.clients.get(serverName)!;
    }

    const config = MCP_SERVERS[serverName];
    if (!config) {
      throw new Error(`Unknown MCP server: ${serverName}`);
    }

    console.log(`🔌 Connecting to ${serverName} MCP server (stdio)...`);

    // Create transport
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
    });

    // Create client
    const client = new Client(
      {
        name: `wildlife-finder-${serverName}-client`,
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    // Connect
    await client.connect(transport);
    console.log(`✅ Connected to ${serverName} MCP server (stdio)`);

    // Store client and transport
    this.clients.set(serverName, client);
    this.transports.set(serverName, transport);

    return client;
  }

  /**
   * Call a tool via stdio (development mode)
   */
  private async callToolStdio(
    serverName: keyof typeof MCP_SERVERS,
    toolName: string,
    args: Record<string, any>
  ): Promise<any> {
    const client = await this.connect(serverName);

    console.log(`🔧 Calling ${serverName}.${toolName} (stdio) with args:`, args);

    const response = await client.callTool({
      name: toolName,
      arguments: args,
    });

    // Parse response content
    const content = (response.content as any)?.[0];
    if (!content) {
      throw new Error('No content in response');
    }

    if (content.type === 'text') {
      try {
        const parsed = JSON.parse(content.text);
        console.log(`✅ ${serverName}.${toolName} response:`, JSON.stringify(parsed).substring(0, 500));
        return parsed;
      } catch {
        console.log(`⚠️ ${serverName}.${toolName} non-JSON response:`, content.text.substring(0, 200));
        return content.text;
      }
    }

    return content;
  }

  /**
   * Call a tool (auto-detects transport based on environment)
   */
  async callTool(
    serverName: keyof typeof MCP_SERVERS,
    toolName: string,
    args: Record<string, any>
  ): Promise<any> {
    if (IS_PRODUCTION) {
      return this.callToolHTTP(serverName, toolName, args);
    } else {
      return this.callToolStdio(serverName, toolName, args);
    }
  }

  /**
   * Disconnect from an MCP server (stdio only)
   */
  async disconnect(serverName: string): Promise<void> {
    if (IS_PRODUCTION) return; // No connections to close in HTTP mode

    const client = this.clients.get(serverName);
    if (!client) return;

    await client.close();
    this.clients.delete(serverName);
    this.transports.delete(serverName);

    console.log(`🔌 Disconnected from ${serverName} MCP server`);
  }

  /**
   * Disconnect from all MCP servers (stdio only)
   */
  async disconnectAll(): Promise<void> {
    if (IS_PRODUCTION) return;

    const serverNames = Array.from(this.clients.keys());
    await Promise.all(serverNames.map((name) => this.disconnect(name)));
  }

  /**
   * List available tools from a server
   */
  async listTools(serverName: keyof typeof MCP_SERVERS): Promise<any[]> {
    if (IS_PRODUCTION) {
      const response = await fetch(`${MCP_SERVER_URL}/mcp/${serverName}/tools`);
      const result = await response.json();
      return result.tools || [];
    } else {
      const client = await this.connect(serverName);
      const response = await client.listTools();
      return response.tools || [];
    }
  }
}

// Singleton instance
let mcpClientManager: MCPClientManager | null = null;

/**
 * Get the MCP client manager instance
 */
export function getMCPClientManager(): MCPClientManager {
  if (!mcpClientManager) {
    mcpClientManager = new MCPClientManager();
  }
  return mcpClientManager;
}

/**
 * Helper functions for Wikipedia MCP server
 */
export const wikipediaMCP = {
  async search(query: string, limit: number = 5) {
    const manager = getMCPClientManager();
    return manager.callTool('wikipedia', 'search_wikipedia', { query, limit });
  },

  async getSummary(title: string) {
    const manager = getMCPClientManager();
    return manager.callTool('wikipedia', 'get_wikipedia_summary', { title });
  },

  async getArticle(title: string) {
    const manager = getMCPClientManager();
    return manager.callTool('wikipedia', 'get_wikipedia_article', { title });
  },

  async extractKeyFacts(title: string, openaiApiKey: string) {
    const manager = getMCPClientManager();
    return manager.callTool('wikipedia', 'extract_wikipedia_key_facts', {
      title,
      openaiApiKey,
    });
  },
};

/**
 * Helper functions for Species Fetcher MCP server
 */
export const speciesFetcherMCP = {
  async geocodeLocation(locationQuery: string) {
    const manager = getMCPClientManager();
    return manager.callTool('speciesFetcher', 'geocode_location', { locationQuery });
  },

  async findSpeciesByLocation(location: {
    latitude: number;
    longitude: number;
    displayName: string;
    city?: string;
    state?: string;
    country?: string;
  }) {
    const manager = getMCPClientManager();
    return manager.callTool('speciesFetcher', 'find_species_by_location', location);
  },

  async getSpeciesInfo(species: {
    commonName: string;
    scientificName: string;
    conservationStatus?: string;
  }) {
    const manager = getMCPClientManager();
    return manager.callTool('speciesFetcher', 'get_species_info', species);
  },

  async getIUCNStatus(scientificName: string, iucnApiKey: string) {
    const manager = getMCPClientManager();
    return manager.callTool('speciesFetcher', 'get_iucn_status', {
      scientificName,
      iucnApiKey,
    });
  },

  async searchConservationOrganizations(
    animalName: string,
    locationName: string,
    openaiApiKey: string
  ) {
    const manager = getMCPClientManager();
    return manager.callTool('speciesFetcher', 'search_conservation_organizations', {
      animalName,
      locationName,
      openaiApiKey,
    });
  },
};
