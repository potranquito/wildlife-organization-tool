#!/usr/bin/env node

/**
 * Species Fetcher MCP Server
 *
 * Provides wildlife species search and geocoding tools for wildlife-finder AI agents.
 *
 * Tools:
 * - geocode_location: Convert location query to coordinates
 * - find_species_by_location: Find wildlife species in a location
 * - get_species_info: Get detailed species information
 * - get_iucn_status: Get IUCN Red List conservation status
 * - search_conservation_organizations: Search for conservation organizations using AI
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
const GeocodeLocationSchema = z.object({
  locationQuery: z.string().describe('Location query (e.g., "Miami, Florida" or "United States")'),
});

const FindSpeciesByLocationSchema = z.object({
  latitude: z.number().describe('Latitude'),
  longitude: z.number().describe('Longitude'),
  displayName: z.string().describe('Location display name'),
  city: z.string().optional().describe('City name'),
  state: z.string().optional().describe('State/province name'),
  country: z.string().optional().describe('Country name'),
});

const GetSpeciesInfoSchema = z.object({
  commonName: z.string().describe('Common species name'),
  scientificName: z.string().describe('Scientific species name'),
  conservationStatus: z.string().optional().describe('Conservation status'),
});

const GetIUCNStatusSchema = z.object({
  scientificName: z.string().describe('Scientific species name'),
  iucnApiKey: z.string().optional().describe('IUCN Red List API key'),
});

const SearchConservationOrganizationsSchema = z.object({
  animalName: z.string().describe('Animal common name'),
  locationName: z.string().describe('Location name (city, state, or country)'),
  openaiApiKey: z.string().optional().describe('OpenAI API key for web search'),
});

// Types
interface Location {
  lat: number;
  lon: number;
  city?: string;
  state?: string;
  country?: string;
  displayName: string;
}

interface Species {
  id?: string;
  commonName: string;
  scientificName: string;
  conservationStatus: string;
  description?: string;
  imageUrl?: string;
  habitat?: string;
  source?: string;
}

// Geocoding function
async function geocodeLocation(locationQuery: string): Promise<Location | null> {
  try {
    console.error(`🗺️ GEOCODING: "${locationQuery}"`);

    const cleanQuery = locationQuery.trim();
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(cleanQuery)}&` +
      `format=json&` +
      `limit=1&` +
      `addressdetails=1`,
      {
        headers: {
          'User-Agent': 'Wildlife-Finder-MCP/1.0 (Educational Conservation Tool)',
        },
      }
    );

    const data = await response.json();

    if (!data || data.length === 0) {
      return null;
    }

    const result = data[0];
    const location: Location = {
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
      displayName: result.display_name,
      city: result.address?.city || result.address?.town || result.address?.village,
      state: result.address?.state,
      country: result.address?.country,
    };

    console.error(`✅ GEOCODED: ${location.displayName}`);
    return location;

  } catch (error) {
    console.error('❌ GEOCODING ERROR:', error);
    return null;
  }
}

// Find species by location
async function findSpeciesByLocation(location: Location): Promise<Species[]> {
  try {
    console.error(`🔍 SPECIES SEARCH: ${location.displayName}`);

    const allSpecies: Species[] = [];

    // Determine search radius based on location type
    // Country/state searches use larger radius, city searches use smaller radius
    const isCountryOrState = !location.city;
    const radius = isCountryOrState ? 500 : 50; // 500km for countries, 50km for cities

    // Search iNaturalist (removed threatened filter to show ALL species)
    const iNatUrl = `https://api.inaturalist.org/v1/observations/species_counts?` +
      `lat=${location.lat}&` +
      `lng=${location.lon}&` +
      `radius=${radius}&` +
      `quality_grade=research&` +
      `per_page=40&` +
      `order=desc&` +
      `order_by=count`;

    const iNatResponse = await fetch(iNatUrl, {
      headers: {
        'User-Agent': 'Wildlife-Finder-MCP/1.0 (Educational Conservation Tool)',
      },
    });

    const iNatData = await iNatResponse.json();

    if (iNatData.results) {
      for (const result of iNatData.results) {
        const taxon = result.taxon;
        if (!taxon) continue;

        allSpecies.push({
          id: `inat-${taxon.id}`,
          commonName: taxon.preferred_common_name || taxon.name,
          scientificName: taxon.name,
          conservationStatus: taxon.conservation_status?.status_name || 'Not Evaluated',
          description: taxon.wikipedia_summary,
          imageUrl: taxon.default_photo?.medium_url,
          habitat: '',
          source: 'iNaturalist',
        });
      }
    }

    // Search GBIF (if needed for more species)
    if (allSpecies.length < 30) {
      const gbifRadius = radius * 1000; // Convert km to meters for GBIF
      const gbifUrl = `https://api.gbif.org/v1/occurrence/search?` +
        `decimalLatitude=${location.lat}&` +
        `decimalLongitude=${location.lon}&` +
        `radius=${gbifRadius}&` +
        `hasCoordinate=true&` +
        `limit=20`;

      const gbifResponse = await fetch(gbifUrl);
      const gbifData = await gbifResponse.json();

      if (gbifData.results) {
        for (const result of gbifData.results) {
          if (!result.species) continue;

          // Avoid duplicates
          const exists = allSpecies.find(
            (s) => s.scientificName.toLowerCase() === result.species.toLowerCase()
          );
          if (exists) continue;

          allSpecies.push({
            id: `gbif-${result.key}`,
            commonName: result.vernacularName || result.species,
            scientificName: result.species,
            conservationStatus: 'Not Evaluated',
            description: '',
            imageUrl: '',
            habitat: '',
            source: 'GBIF',
          });
        }
      }
    }

    console.error(`✅ FOUND ${allSpecies.length} species`);
    return allSpecies.slice(0, 20);

  } catch (error) {
    console.error('❌ SPECIES SEARCH ERROR:', error);
    return [];
  }
}

// Get species info
async function getSpeciesInfo(species: Species): Promise<Species> {
  try {
    console.error(`📖 SPECIES INFO: ${species.commonName}`);

    // Get Wikipedia summary
    const searchQuery = species.commonName || species.scientificName;
    const response = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchQuery)}`,
      {
        headers: {
          'User-Agent': 'Wildlife-Finder-MCP/1.0 (Educational Conservation Tool)',
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      return {
        ...species,
        description: data.extract || species.description,
        imageUrl: data.thumbnail?.source || species.imageUrl,
      };
    }

    return species;

  } catch (error) {
    console.error('❌ SPECIES INFO ERROR:', error);
    return species;
  }
}

// Get IUCN Red List status
async function getIUCNStatus(scientificName: string, iucnApiKey?: string) {
  try {
    console.error(`🔴 IUCN STATUS: ${scientificName}`);

    if (!iucnApiKey) {
      throw new Error('IUCN API key is required');
    }

    const iucnUrl = `https://api.iucnredlist.org/api/v4/species/${encodeURIComponent(scientificName)}?token=${iucnApiKey}`;

    const response = await fetch(iucnUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Wildlife-Finder-MCP/1.0 (Educational Conservation Tool)',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          found: false,
          scientificName,
          message: 'Species not found in IUCN Red List database',
        };
      }
      throw new Error(`IUCN API error: ${response.status}`);
    }

    const data = await response.json();
    const speciesData = data.result?.[0];

    if (!speciesData) {
      return {
        found: false,
        scientificName,
        message: 'No data returned from IUCN Red List',
      };
    }

    console.error(`✅ IUCN STATUS: ${scientificName} - ${speciesData.category}`);

    return {
      found: true,
      scientificName: speciesData.scientific_name,
      commonName: speciesData.main_common_name,
      category: speciesData.category,
      categoryLabel: getCategoryLabel(speciesData.category),
      populationTrend: speciesData.population_trend,
      assessmentDate: speciesData.assessment_date,
      criteria: speciesData.criteria,
      taxonId: speciesData.taxonid,
      kingdom: speciesData.kingdom,
      phylum: speciesData.phylum,
      class: speciesData.class,
      order: speciesData.order,
      family: speciesData.family,
      genus: speciesData.genus,
    };

  } catch (error) {
    console.error('❌ IUCN STATUS ERROR:', error);
    throw error;
  }
}

function getCategoryLabel(category: string): string {
  const labels: { [key: string]: string } = {
    'CR': 'Critically Endangered',
    'EN': 'Endangered',
    'VU': 'Vulnerable',
    'NT': 'Near Threatened',
    'LC': 'Least Concern',
    'DD': 'Data Deficient',
    'NE': 'Not Evaluated',
    'EW': 'Extinct in the Wild',
    'EX': 'Extinct',
  };
  return labels[category] || category;
}

// Search conservation organizations using OpenAI web search
async function searchConservationOrganizations(
  animalName: string,
  locationName: string,
  openaiApiKey?: string
) {
  try {
    console.error(`🔍 SEARCH ORGS: ${animalName} in ${locationName}`);

    if (!openaiApiKey) {
      throw new Error('OpenAI API key is required for web search');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-search-preview',
        web_search_options: {},
        messages: [
          {
            role: 'system',
            content: 'You are a wildlife conservation expert. Search the web for SPECIFIC conservation organizations that work DIRECTLY with the species mentioned. Be taxonomically accurate - only suggest organizations that actually work with that specific species or closely related taxa.',
          },
          {
            role: 'user',
            content: `Find 3-5 real conservation organizations that SPECIFICALLY work to protect "${animalName}" in ${locationName}.

**CRITICAL REQUIREMENTS:**
1. Organizations MUST actually work with "${animalName}" or closely related species (same family/order)
2. DO NOT suggest organizations that work with unrelated species, even if they're in the same country
3. Verify that each organization's mission/focus is relevant to "${animalName}"

**Examples of WRONG matches to avoid:**
- Tiger organizations for bird species ❌
- Bear organizations for fish species ❌
- Marine organizations for terrestrial species ❌

**Preferred order:**
1. Species-specific organizations (e.g., "Florida Panther Conservation")
2. Habitat/ecosystem organizations where the species lives
3. Taxonomic group organizations (e.g., bird conservation groups for birds)
4. General biodiversity organizations as last resort

**For each organization, provide:**

1. Organization Name
Website: [URL]
Description: [How they SPECIFICALLY help ${animalName} or its habitat]
Location: [Geographic scope]

Only include organizations with verified websites. If you cannot find species-specific organizations, clearly state this and suggest general wildlife organizations instead.`,
          },
        ],
      }),
    });

    const result = await response.json();
    const resultText = result.choices[0]?.message?.content || '';

    console.error(`✅ FOUND ORGS for ${animalName}`);
    console.error(`📝 RAW OPENAI RESPONSE:\n${resultText.substring(0, 800)}`);

    // Parse organizations from the response
    const organizations = parseOrganizationsFromText(resultText, locationName);
    console.error(`🔍 PARSED ${organizations.length} ORGS, first org:`, JSON.stringify(organizations[0], null, 2));
    return organizations;

  } catch (error) {
    console.error('❌ SEARCH ORGS ERROR:', error);
    throw error;
  }
}

function parseOrganizationsFromText(text: string, defaultLocation: string) {
  const organizations: any[] = [];
  const lines = text.split('\n');

  let currentOrg: any = {};
  let skipNextLines = false;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      skipNextLines = false;
      continue;
    }

    // Skip standalone field labels (these are NOT organization names)
    if (trimmedLine.match(/^(Website|Description|Location|Focus):\s*$/i) ||
        trimmedLine.match(/^[-•]\s*(Website|Description|Location|Focus):\s*$/i)) {
      skipNextLines = true;
      continue;
    }

    // Check if line starts with a number (new organization)
    const numberMatch = trimmedLine.match(/^(\d+)\.\s*\*?\*?(.+?)\*?\*?$/);

    if (numberMatch) {
      skipNextLines = false;

      // Save previous org if it exists and is valid
      if (currentOrg.name && currentOrg.name.trim().length > 0) {
        organizations.push({
          name: currentOrg.name.trim(),
          website: currentOrg.website || '',
        });
      }

      // Start new org - extract name and remove markdown bold
      let orgName = numberMatch[2].trim().replace(/^\*\*(.+?)\*\*$/, '$1');
      currentOrg = { name: orgName, website: '' };
      continue;
    }

    // If we're in skip mode or don't have a current org, skip this line
    if (skipNextLines || !currentOrg.name) continue;

    // Check for website line with bullet points
    // Format: - **Website:** ([domain](URL)) or variations
    const bulletWebsiteMatch = trimmedLine.match(/^[-•]\s*\*?\*?Website:?\*?\*?\s*(.+)$/i);
    if (bulletWebsiteMatch && currentOrg.name) {
      let websiteContent = bulletWebsiteMatch[1].trim();

      // Extract URL from various markdown formats:
      // Format 1: ([text](URL)) - OpenAI's nested markdown
      const nestedMarkdownMatch = websiteContent.match(/\(\[.*?\]\((https?:\/\/[^\)]+)\)\)/);
      // Format 2: [text](URL) - standard markdown
      const markdownMatch = websiteContent.match(/\[.*?\]\((https?:\/\/[^\)]+)\)/);
      // Format 3: (URL) - parenthesized URL
      const parenUrlMatch = websiteContent.match(/\((https?:\/\/[^\)]+)\)/);
      // Format 4: plain URL
      const plainUrlMatch = websiteContent.match(/(https?:\/\/[^\s\)]+)/);

      let website = '';
      if (nestedMarkdownMatch) {
        website = nestedMarkdownMatch[1];
      } else if (markdownMatch) {
        website = markdownMatch[1];
      } else if (parenUrlMatch) {
        website = parenUrlMatch[1];
      } else if (plainUrlMatch) {
        website = plainUrlMatch[1];
      } else if (websiteContent.includes('.') && !websiteContent.startsWith('http')) {
        // Plain domain name, add https://
        website = `https://${websiteContent}`;
      }

      if (website) {
        // Clean up URL - remove tracking parameters
        website = website.replace(/\?utm_source=.*$/, '');
        currentOrg.website = website;
      }
      continue;
    }

    // Skip description and location lines entirely (we don't need them)
    if (trimmedLine.match(/^[-•]\s*(?:Description|Location|Focus):/i)) {
      continue;
    }
  }

  // Don't forget the last organization
  if (currentOrg.name && currentOrg.name.trim().length > 0) {
    organizations.push({
      name: currentOrg.name.trim(),
      website: currentOrg.website || '',
    });
  }

  // Filter out invalid organizations (field labels that slipped through)
  const validOrgs = organizations.filter(org =>
    org.name &&
    org.name.length > 0 &&
    !org.name.match(/^(Website|Description|Location|Focus):?$/i)
  );

  console.error(`🔍 PARSED ${validOrgs.length} valid organizations from ${organizations.length} total`);
  if (validOrgs.length > 0) {
    console.error(`📋 First org:`, JSON.stringify(validOrgs[0], null, 2));
  }

  return validOrgs;
}

// Create MCP server
const server = new Server(
  {
    name: 'species-fetcher-mcp-server',
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
    name: 'geocode_location',
    description: 'Convert a location query (city, state, country) into geographic coordinates and structured location data.',
    inputSchema: {
      type: 'object',
      properties: {
        locationQuery: {
          type: 'string',
          description: 'Location query (e.g., "Miami, Florida" or "United States")',
        },
      },
      required: ['locationQuery'],
    },
  },
  {
    name: 'find_species_by_location',
    description: 'Find wildlife species observed in a specific location using iNaturalist and GBIF APIs.',
    inputSchema: {
      type: 'object',
      properties: {
        latitude: {
          type: 'number',
          description: 'Latitude',
        },
        longitude: {
          type: 'number',
          description: 'Longitude',
        },
        displayName: {
          type: 'string',
          description: 'Location display name',
        },
        city: {
          type: 'string',
          description: 'City name',
        },
        state: {
          type: 'string',
          description: 'State/province name',
        },
        country: {
          type: 'string',
          description: 'Country name',
        },
      },
      required: ['latitude', 'longitude', 'displayName'],
    },
  },
  {
    name: 'get_species_info',
    description: 'Get detailed information about a species including description and images from Wikipedia.',
    inputSchema: {
      type: 'object',
      properties: {
        commonName: {
          type: 'string',
          description: 'Common species name',
        },
        scientificName: {
          type: 'string',
          description: 'Scientific species name',
        },
        conservationStatus: {
          type: 'string',
          description: 'Conservation status',
        },
      },
      required: ['commonName', 'scientificName'],
    },
  },
  {
    name: 'get_iucn_status',
    description: 'Get IUCN Red List conservation status for a species. Requires IUCN API key.',
    inputSchema: {
      type: 'object',
      properties: {
        scientificName: {
          type: 'string',
          description: 'Scientific species name',
        },
        iucnApiKey: {
          type: 'string',
          description: 'IUCN Red List API key',
        },
      },
      required: ['scientificName'],
    },
  },
  {
    name: 'search_conservation_organizations',
    description: 'Search for conservation organizations using AI-powered web search. Requires OpenAI API key.',
    inputSchema: {
      type: 'object',
      properties: {
        animalName: {
          type: 'string',
          description: 'Animal common name',
        },
        locationName: {
          type: 'string',
          description: 'Location name (city, state, or country)',
        },
        openaiApiKey: {
          type: 'string',
          description: 'OpenAI API key for web search',
        },
      },
      required: ['animalName', 'locationName'],
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
      case 'geocode_location': {
        const parsed = GeocodeLocationSchema.parse(args);
        const location = await geocodeLocation(parsed.locationQuery);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(location, null, 2),
            },
          ],
        };
      }

      case 'find_species_by_location': {
        const parsed = FindSpeciesByLocationSchema.parse(args);
        const location: Location = {
          lat: parsed.latitude,
          lon: parsed.longitude,
          displayName: parsed.displayName,
          city: parsed.city,
          state: parsed.state,
          country: parsed.country,
        };
        const species = await findSpeciesByLocation(location);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(species, null, 2),
            },
          ],
        };
      }

      case 'get_species_info': {
        const parsed = GetSpeciesInfoSchema.parse(args);
        const species: Species = {
          commonName: parsed.commonName,
          scientificName: parsed.scientificName,
          conservationStatus: parsed.conservationStatus || 'Not Evaluated',
        };
        const info = await getSpeciesInfo(species);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(info, null, 2),
            },
          ],
        };
      }

      case 'get_iucn_status': {
        const parsed = GetIUCNStatusSchema.parse(args);
        const status = await getIUCNStatus(parsed.scientificName, parsed.iucnApiKey);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(status, null, 2),
            },
          ],
        };
      }

      case 'search_conservation_organizations': {
        const parsed = SearchConservationOrganizationsSchema.parse(args);
        const organizations = await searchConservationOrganizations(
          parsed.animalName,
          parsed.locationName,
          parsed.openaiApiKey
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(organizations, null, 2),
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
  console.error('Species Fetcher MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
