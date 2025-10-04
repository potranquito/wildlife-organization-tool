/**
 * MCP Demo API Route
 *
 * Example showing how to use MCP tools with AI agents
 */

import { NextRequest, NextResponse } from 'next/server';
import { wikipediaMCP, speciesFetcherMCP, getMCPClientManager } from '@/lib/mcp-client';

export async function POST(request: NextRequest) {
  try {
    const { action, data } = await request.json();

    switch (action) {
      // Wikipedia MCP examples
      case 'wikipedia_search': {
        const results = await wikipediaMCP.search(data.query, data.limit);
        return NextResponse.json({ results });
      }

      case 'wikipedia_summary': {
        const summary = await wikipediaMCP.getSummary(data.title);
        return NextResponse.json({ summary });
      }

      case 'wikipedia_key_facts': {
        const facts = await wikipediaMCP.extractKeyFacts(
          data.title,
          process.env.OPENAI_API_KEY || ''
        );
        return NextResponse.json({ facts });
      }

      // Species Fetcher MCP examples
      case 'geocode': {
        const location = await speciesFetcherMCP.geocodeLocation(data.locationQuery);
        return NextResponse.json({ location });
      }

      case 'find_species': {
        const species = await speciesFetcherMCP.findSpeciesByLocation({
          latitude: data.latitude,
          longitude: data.longitude,
          displayName: data.displayName,
          city: data.city,
          state: data.state,
          country: data.country,
        });
        return NextResponse.json({ species });
      }

      case 'species_info': {
        const info = await speciesFetcherMCP.getSpeciesInfo({
          commonName: data.commonName,
          scientificName: data.scientificName,
          conservationStatus: data.conservationStatus,
        });
        return NextResponse.json({ info });
      }

      // Full workflow example
      case 'full_workflow': {
        // Step 1: Geocode location
        const location = await speciesFetcherMCP.geocodeLocation(data.locationQuery);

        if (!location) {
          return NextResponse.json({ error: 'Location not found' }, { status: 404 });
        }

        // Step 2: Find species at that location
        const species = await speciesFetcherMCP.findSpeciesByLocation({
          latitude: location.lat,
          longitude: location.lon,
          displayName: location.displayName,
          city: location.city,
          state: location.state,
          country: location.country,
        });

        // Step 3: Get Wikipedia summary for first species
        let wikipediaSummary = null;
        if (species.length > 0) {
          const firstSpecies = species[0];
          try {
            wikipediaSummary = await wikipediaMCP.getSummary(firstSpecies.commonName);
          } catch (error) {
            console.error('Wikipedia summary failed:', error);
          }
        }

        return NextResponse.json({
          location,
          speciesCount: species.length,
          species: species.slice(0, 5),
          wikipediaSummary,
        });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('MCP Demo error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  } finally {
    // Clean up: disconnect from MCP servers
    // Note: In production, you might want to keep connections open
    // and reuse them across requests
    const manager = getMCPClientManager();
    await manager.disconnectAll();
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'MCP Demo API',
    availableActions: [
      'wikipedia_search',
      'wikipedia_summary',
      'wikipedia_key_facts',
      'geocode',
      'find_species',
      'species_info',
      'full_workflow',
    ],
    example: {
      action: 'full_workflow',
      data: {
        locationQuery: 'Miami, Florida',
      },
    },
  });
}
