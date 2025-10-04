#!/usr/bin/env node

/**
 * Wikipedia MCP Server
 *
 * Provides Wikipedia search and retrieval tools for wildlife-finder AI agents.
 *
 * Tools:
 * - search_wikipedia: Search for Wikipedia articles
 * - get_wikipedia_summary: Get article summary with images
 * - get_wikipedia_article: Get full article content
 * - extract_wikipedia_key_facts: Extract key facts using AI
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// Tool schemas
const SearchWikipediaSchema = z.object({
  query: z.string().describe('Search query string'),
  limit: z.number().optional().default(5).describe('Maximum number of results (default: 5)'),
});

const GetSummarySchema = z.object({
  title: z.string().describe('Wikipedia article title'),
});

const GetArticleSchema = z.object({
  title: z.string().describe('Wikipedia article title'),
});

const ExtractKeyFactsSchema = z.object({
  title: z.string().describe('Wikipedia article title'),
  openaiApiKey: z.string().optional().describe('OpenAI API key for fact extraction'),
});

// Wikipedia API functions
async function searchWikipedia(query: string, limit: number = 5) {
  const response = await fetch(
    `https://en.wikipedia.org/w/api.php?` +
    `action=query&` +
    `list=search&` +
    `srsearch=${encodeURIComponent(query)}&` +
    `srlimit=${limit}&` +
    `format=json&` +
    `origin=*`,
    {
      headers: {
        'User-Agent': 'Wildlife-Finder-MCP/1.0 (Educational Conservation Tool)',
      },
    }
  );

  const data = await response.json();
  return data.query?.search || [];
}

async function getWikipediaSummary(title: string) {
  const response = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    {
      headers: {
        'User-Agent': 'Wildlife-Finder-MCP/1.0 (Educational Conservation Tool)',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Article "${title}" not found (${response.status})`);
  }

  const data = await response.json();
  return {
    title: data.title,
    extract: data.extract || '',
    thumbnail: data.thumbnail,
    originalimage: data.originalimage,
    pageUrl: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
  };
}

async function getWikipediaArticle(title: string) {
  const response = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title)}`,
    {
      headers: {
        'User-Agent': 'Wildlife-Finder-MCP/1.0 (Educational Conservation Tool)',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Article "${title}" not found (${response.status})`);
  }

  return await response.text();
}

async function extractWikipediaKeyFacts(title: string, openaiApiKey?: string) {
  // First get the summary
  const summary = await getWikipediaSummary(title);

  if (!openaiApiKey) {
    throw new Error('OpenAI API key is required for fact extraction');
  }

  // Use OpenAI to extract key facts
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You extract key facts from Wikipedia articles about wildlife and conservation topics. Format each fact as: CATEGORY: Fact text',
        },
        {
          role: 'user',
          content: `Extract 5-7 key facts from this Wikipedia summary about "${title}":\n\n${summary.extract}\n\nFormat each as: CATEGORY: Fact\nCategories can be: Habitat, Diet, Conservation Status, Physical Characteristics, Behavior, Range, Population, etc.`,
        },
      ],
      temperature: 0.3,
    }),
  });

  const result = await response.json();
  const resultText = result.choices[0]?.message?.content || '';

  // Parse the facts
  const facts: Array<{ category: string; fact: string }> = [];
  const lines = resultText.split('\n').filter((line: string) => line.trim());

  for (const line of lines) {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (match) {
      facts.push({
        category: match[1].trim(),
        fact: match[2].trim(),
      });
    }
  }

  return facts;
}

// Create MCP server
const server = new Server(
  {
    name: 'wikipedia-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define tools
const tools: Tool[] = [
  {
    name: 'search_wikipedia',
    description: 'Search Wikipedia for articles matching a query. Returns article titles and snippets.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query string',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 5)',
          default: 5,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_wikipedia_summary',
    description: 'Get a concise summary of a Wikipedia article with images and page URL.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Wikipedia article title',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'get_wikipedia_article',
    description: 'Get the full HTML content of a Wikipedia article.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Wikipedia article title',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'extract_wikipedia_key_facts',
    description: 'Extract key facts from a Wikipedia article using AI. Requires OpenAI API key.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Wikipedia article title',
        },
        openaiApiKey: {
          type: 'string',
          description: 'OpenAI API key for fact extraction',
        },
      },
      required: ['title'],
    },
  },
];

// Handle list_tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle call_tool request
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'search_wikipedia': {
        const parsed = SearchWikipediaSchema.parse(args);
        const results = await searchWikipedia(parsed.query, parsed.limit);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case 'get_wikipedia_summary': {
        const parsed = GetSummarySchema.parse(args);
        const summary = await getWikipediaSummary(parsed.title);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(summary, null, 2),
            },
          ],
        };
      }

      case 'get_wikipedia_article': {
        const parsed = GetArticleSchema.parse(args);
        const article = await getWikipediaArticle(parsed.title);
        return {
          content: [
            {
              type: 'text',
              text: article,
            },
          ],
        };
      }

      case 'extract_wikipedia_key_facts': {
        const parsed = ExtractKeyFactsSchema.parse(args);
        const facts = await extractWikipediaKeyFacts(parsed.title, parsed.openaiApiKey);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(facts, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Wikipedia MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
