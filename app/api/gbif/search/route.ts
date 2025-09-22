import { NextRequest } from 'next/server';

const GBIF_BASE = 'https://api.gbif.org/v1';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  console.log('🌍 GBIF SEARCH API called with params:', Object.fromEntries(searchParams.entries()));
  const q = searchParams.get('q'); // search query
  const rank = searchParams.get('rank'); // SPECIES, GENUS, FAMILY, etc.
  const status = searchParams.get('status'); // ACCEPTED, SYNONYM, etc.
  const limit = searchParams.get('limit') ?? '20';
  const offset = searchParams.get('offset') ?? '0';

  if (!q) {
    return new Response(
      JSON.stringify({ error: 'Query parameter "q" is required' }),
      { status: 400 }
    );
  }

  // Build search parameters
  const params = new URLSearchParams({
    q: q,
    limit,
    offset
  });

  if (rank) params.set('rank', rank);
  if (status) params.set('status', status);

  // Default to species-level results for wildlife finder
  if (!rank) params.set('rank', 'SPECIES');

  const url = `${GBIF_BASE}/species/search?${params.toString()}`;

  console.log('🌐 FETCHING GBIF species search from:', url);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Wildlife-Finder/1.0 (conservation education tool - contact@example.com)'
      },
      // Cache search results for 1 hour
      next: { revalidate: 3600 }
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('GBIF search API error:', response.status, text);
      return new Response(
        JSON.stringify({ error: `GBIF search API error: ${response.status}` }),
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log(`✅ GBIF search SUCCESS: ${data.results?.length || 0} species found`);
    return Response.json(data);
  } catch (error) {
    console.error('GBIF search fetch error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to search GBIF API' }),
      { status: 500 }
    );
  }
}