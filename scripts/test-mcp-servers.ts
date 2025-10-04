#!/usr/bin/env tsx

/**
 * Test script for MCP servers
 *
 * Tests all MCP tools to verify they work correctly
 */

import { wikipediaMCP, speciesFetcherMCP, getMCPClientManager } from '../lib/mcp-client';

async function testWikipediaMCP() {
  console.log('\n🔍 TESTING WIKIPEDIA MCP SERVER\n');

  try {
    // Test 1: Search Wikipedia
    console.log('Test 1: search_wikipedia');
    const searchResults = await wikipediaMCP.search('Florida Panther', 3);
    console.log('✅ Search results:', JSON.stringify(searchResults.slice(0, 2), null, 2));

    // Test 2: Get Wikipedia summary
    console.log('\nTest 2: get_wikipedia_summary');
    const summary = await wikipediaMCP.getSummary('Florida Panther');
    console.log('✅ Summary:', {
      title: summary.title,
      extractLength: summary.extract?.length,
      hasThumbnail: !!summary.thumbnail,
      pageUrl: summary.pageUrl,
    });

    // Test 3: Get Wikipedia article (first 500 chars)
    console.log('\nTest 3: get_wikipedia_article');
    const article = await wikipediaMCP.getArticle('Florida Panther');
    console.log('✅ Article HTML length:', article?.length);

    console.log('\n✅ Wikipedia MCP Server: ALL TESTS PASSED\n');
    return true;
  } catch (error) {
    console.error('❌ Wikipedia MCP Server FAILED:', error);
    return false;
  }
}

async function testSpeciesFetcherMCP() {
  console.log('\n🔍 TESTING SPECIES FETCHER MCP SERVER\n');

  try {
    // Test 1: Geocode location
    console.log('Test 1: geocode_location');
    const location = await speciesFetcherMCP.geocodeLocation('Miami, Florida');
    console.log('✅ Location:', {
      displayName: location?.displayName,
      lat: location?.lat,
      lon: location?.lon,
      city: location?.city,
      state: location?.state,
      country: location?.country,
    });

    if (!location) {
      throw new Error('Geocoding failed');
    }

    // Test 2: Find species by location
    console.log('\nTest 2: find_species_by_location');
    const species = await speciesFetcherMCP.findSpeciesByLocation({
      latitude: location.lat,
      longitude: location.lon,
      displayName: location.displayName,
      city: location.city,
      state: location.state,
      country: location.country,
    });
    console.log('✅ Found species:', species.length);
    console.log('First 3 species:', species.slice(0, 3).map((s: any) => ({
      commonName: s.commonName,
      scientificName: s.scientificName,
      source: s.source,
    })));

    if (species.length === 0) {
      throw new Error('No species found');
    }

    // Test 3: Get species info
    console.log('\nTest 3: get_species_info');
    const speciesInfo = await speciesFetcherMCP.getSpeciesInfo({
      commonName: 'Florida Panther',
      scientificName: 'Puma concolor coryi',
      conservationStatus: 'Endangered',
    });
    console.log('✅ Species info:', {
      commonName: speciesInfo.commonName,
      scientificName: speciesInfo.scientificName,
      hasDescription: !!speciesInfo.description,
      hasImage: !!speciesInfo.imageUrl,
    });

    // Test 4: Get IUCN status (only if API key available)
    if (process.env.IUCN_API_KEY) {
      console.log('\nTest 4: get_iucn_status');
      const iucnStatus = await speciesFetcherMCP.getIUCNStatus(
        'Puma concolor coryi',
        process.env.IUCN_API_KEY
      );
      console.log('✅ IUCN status:', {
        found: iucnStatus.found,
        category: iucnStatus.category,
        categoryLabel: iucnStatus.categoryLabel,
      });
    } else {
      console.log('\nTest 4: get_iucn_status - SKIPPED (no IUCN_API_KEY)');
    }

    // Test 5: Search conservation organizations (only if OpenAI key available)
    if (process.env.OPENAI_API_KEY) {
      console.log('\nTest 5: search_conservation_organizations');
      const orgs = await speciesFetcherMCP.searchConservationOrganizations(
        'Florida Panther',
        'Florida',
        process.env.OPENAI_API_KEY
      );
      console.log('✅ Found organizations:', orgs.length);
      console.log('Organizations:', orgs.slice(0, 2).map((org: any) => ({
        name: org.name,
        location: org.location,
        hasWebsite: !!org.website,
      })));
    } else {
      console.log('\nTest 5: search_conservation_organizations - SKIPPED (no OPENAI_API_KEY)');
    }

    console.log('\n✅ Species Fetcher MCP Server: ALL TESTS PASSED\n');
    return true;
  } catch (error) {
    console.error('❌ Species Fetcher MCP Server FAILED:', error);
    return false;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('MCP SERVERS TEST SUITE');
  console.log('='.repeat(60));

  const wikipediaPass = await testWikipediaMCP();
  const speciesFetcherPass = await testSpeciesFetcherMCP();

  // Cleanup
  console.log('\n🧹 Cleaning up MCP connections...');
  const manager = getMCPClientManager();
  await manager.disconnectAll();
  console.log('✅ Cleanup complete');

  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Wikipedia MCP: ${wikipediaPass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Species Fetcher MCP: ${speciesFetcherPass ? '✅ PASS' : '❌ FAIL'}`);
  console.log('='.repeat(60));

  if (wikipediaPass && speciesFetcherPass) {
    console.log('\n🎉 ALL MCP SERVERS WORKING CORRECTLY!\n');
    process.exit(0);
  } else {
    console.log('\n❌ SOME TESTS FAILED\n');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
