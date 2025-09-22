import { NextRequest } from 'next/server';

const INAT_BASE = 'https://api.inaturalist.org/v1';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q'); // species common or scientific name
  const perPage = searchParams.get('per_page') ?? '20';

  if (!q) {
    return new Response(
      JSON.stringify({ error: 'Query parameter "q" is required' }),
      { status: 400 }
    );
  }

  const url = `${INAT_BASE}/taxa/autocomplete?q=${encodeURIComponent(q)}&per_page=${perPage}&locale=en`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Wildlife-Finder/1.0 (conservation education tool)'
      },
      // Cache taxa lookups for a day since they don't change often
      next: { revalidate: 86400 }
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('iNaturalist taxa API error:', response.status, text);
      return new Response(
        JSON.stringify({ error: `iNaturalist taxa API error: ${response.status}` }),
        { status: response.status }
      );
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('iNaturalist taxa fetch error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch from iNaturalist taxa API' }),
      { status: 500 }
    );
  }
}