import { NextRequest } from 'next/server';

const GBIF_BASE = 'https://api.gbif.org/v1';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  console.log('🌍 GBIF OCCURRENCES API called with params:', Object.fromEntries(searchParams.entries()));
  const name = searchParams.get('name'); // species name OR supply taxonKey directly
  const taxonKey = searchParams.get('taxonKey');
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  const radiusKm = Number(searchParams.get('radius') ?? '50');

  let key = taxonKey;

  // If no taxonKey provided, look it up by name
  if (!key && name) {
    try {
      console.log('🔍 GBIF species match lookup for:', name);
      const matchResponse = await fetch(
        `${GBIF_BASE}/species/match?name=${encodeURIComponent(name)}`,
        {
          headers: {
            'User-Agent': 'Wildlife-Finder/1.0 (conservation education tool - contact@example.com)'
          },
          next: { revalidate: 86400 } // Cache species matches for a day
        }
      );

      if (matchResponse.ok) {
        const match = await matchResponse.json();
        key = match.usageKey?.toString();
      }
    } catch (error) {
      console.error('GBIF species match error:', error);
    }
  }

  if (!key) {
    return new Response(
      JSON.stringify({ error: 'taxonKey or name parameter is required' }),
      { status: 400 }
    );
  }

  // Build occurrence search parameters
  const params = new URLSearchParams({
    taxonKey: key,
    limit: searchParams.get('limit') ?? '100',
    offset: searchParams.get('offset') ?? '0',
    hasCoordinate: 'true'
  });

  // Add geospatial filter if coordinates provided
  // Simple geospatial filter: circle -> bounding box (approximation)
  if (lat && lng) {
    const deg = radiusKm / 111; // ~km per degree latitude (rough approximation)
    const latMin = Number(lat) - deg;
    const latMax = Number(lat) + deg;
    const lngMin = Number(lng) - deg;
    const lngMax = Number(lng) + deg;

    params.set('decimalLatitude', `${latMin},${latMax}`);
    params.set('decimalLongitude', `${lngMin},${lngMax}`);
  }

  // Add additional quality filters
  params.set('basisOfRecord', 'HUMAN_OBSERVATION,OBSERVATION');

  // Optional: filter by recent years for more relevant data
  const minYear = searchParams.get('minYear') ?? '2010';
  const maxYear = searchParams.get('maxYear') ?? new Date().getFullYear().toString();
  params.set('year', `${minYear},${maxYear}`);

  const url = `${GBIF_BASE}/occurrence/search?${params.toString()}`;

  console.log('🌐 FETCHING GBIF occurrences from:', url);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Wildlife-Finder/1.0 (conservation education tool - contact@example.com)'
      },
      // Cache for 5 minutes
      next: { revalidate: 300 }
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('GBIF API error:', response.status, text);
      return new Response(
        JSON.stringify({ error: `GBIF API error: ${response.status}` }),
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log(`✅ GBIF occurrences SUCCESS: ${data.results?.length || 0} occurrences found (total: ${data.count || 0})`);
    return Response.json(data);
  } catch (error) {
    console.error('GBIF fetch error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch from GBIF API' }),
      { status: 500 }
    );
  }
}