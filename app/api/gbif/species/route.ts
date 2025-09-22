import { NextRequest } from 'next/server';

const GBIF_BASE = 'https://api.gbif.org/v1';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get('name');
  const taxonKey = searchParams.get('taxonKey');

  if (!name && !taxonKey) {
    return new Response(
      JSON.stringify({ error: 'Either "name" or "taxonKey" parameter is required' }),
      { status: 400 }
    );
  }

  try {
    let url: string;

    if (taxonKey) {
      // Get species details by taxonKey
      url = `${GBIF_BASE}/species/${taxonKey}`;
    } else {
      // Match species by name
      url = `${GBIF_BASE}/species/match?name=${encodeURIComponent(name!)}`;
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Wildlife-Finder/1.0 (conservation education tool - contact@example.com)'
      },
      // Cache species data for a day
      next: { revalidate: 86400 }
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('GBIF species API error:', response.status, text);
      return new Response(
        JSON.stringify({ error: `GBIF species API error: ${response.status}` }),
        { status: response.status }
      );
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('GBIF species fetch error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch species data from GBIF API' }),
      { status: 500 }
    );
  }
}