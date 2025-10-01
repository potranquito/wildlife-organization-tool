import { NextRequest } from 'next/server';

const GBIF_BASE = 'https://api.gbif.org/v1';

/**
 * Search for endangered/threatened species occurrences in a geographic area
 * Uses GBIF's iucnRedListCategory filter
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  console.log('🔴 GBIF ENDANGERED OCCURRENCES API called with params:', Object.fromEntries(searchParams.entries()));

  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  const radiusKm = Number(searchParams.get('radius') ?? '50');
  const taxon = searchParams.get('taxon'); // e.g., "Mammalia", "Aves"
  const limit = searchParams.get('limit') ?? '100';

  if (!lat || !lng) {
    return new Response(
      JSON.stringify({ error: 'lat and lng parameters are required' }),
      { status: 400 }
    );
  }

  // Build occurrence search parameters
  const params = new URLSearchParams({
    limit,
    offset: '0',
    hasCoordinate: 'true'
  });

  // Add taxonomic filter if provided
  if (taxon) {
    params.set('higherTaxonKey', taxon);
  }

  // Add geospatial filter (bounding box approximation)
  const deg = radiusKm / 111; // ~km per degree latitude
  const latMin = Number(lat) - deg;
  const latMax = Number(lat) + deg;
  const lngMin = Number(lng) - deg;
  const lngMax = Number(lng) + deg;

  params.set('decimalLatitude', `${latMin},${latMax}`);
  params.set('decimalLongitude', `${lngMin},${lngMax}`);

  // CRITICAL: Filter by IUCN Red List categories for endangered species
  // CR = Critically Endangered, EN = Endangered, VU = Vulnerable, NT = Near Threatened
  params.set('iucnRedListCategory', 'CR,EN,VU,NT');

  // Filter for quality observations
  const minYear = '2010';
  const maxYear = new Date().getFullYear().toString();
  params.set('year', `${minYear},${maxYear}`);

  const url = `${GBIF_BASE}/occurrence/search?${params.toString()}`;

  console.log('🌐 FETCHING ENDANGERED GBIF occurrences from:', url);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Wildlife-Finder/1.0 (conservation education tool)'
      },
      // Cache for 5 minutes
      next: { revalidate: 300 }
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('GBIF endangered occurrences API error:', response.status, text);
      return new Response(
        JSON.stringify({ error: `GBIF API error: ${response.status}` }),
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log(`✅ GBIF ENDANGERED occurrences SUCCESS: ${data.results?.length || 0} occurrences found (total: ${data.count || 0})`);
    return Response.json(data);
  } catch (error) {
    console.error('GBIF endangered occurrences fetch error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch from GBIF API' }),
      { status: 500 }
    );
  }
}
