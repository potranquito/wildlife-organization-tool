import { NextRequest } from 'next/server';

const INAT_BASE = 'https://api.inaturalist.org/v1';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // Example accepted params: taxon_id, taxon_name, lat, lng, radius (km), place_id, page, per_page
  const qs = new URLSearchParams();

  // Basic filters
  const taxonId = searchParams.get('taxon_id');
  const taxonName = searchParams.get('taxon_name');
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  const radius = searchParams.get('radius') ?? '50'; // km - increased default for better coverage
  const placeId = searchParams.get('place_id');

  if (taxonId) qs.set('taxon_id', taxonId);
  if (taxonName) qs.set('taxon_name', taxonName);
  if (lat && lng) {
    qs.set('lat', lat);
    qs.set('lng', lng);
    qs.set('radius', radius);
  }
  if (placeId) qs.set('place_id', placeId);

  // Pagination
  qs.set('page', searchParams.get('page') ?? '1');
  qs.set('per_page', searchParams.get('per_page') ?? '50');

  // Useful defaults for wildlife discovery
  qs.set('order_by', 'created_at');
  qs.set('order', 'desc');
  qs.set('verifiable', 'true');          // only "research/needs_id" quality
  qs.set('photos', 'true');              // include photo URLs
  qs.set('locale', 'en');
  qs.set('quality_grade', 'research');   // research grade observations only

  const url = `${INAT_BASE}/observations?${qs.toString()}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Wildlife-Finder/1.0 (conservation education tool)'
      },
      // Cache for 5 minutes at the edge for better performance
      next: { revalidate: 300 }
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('iNaturalist API error:', response.status, text);
      return new Response(
        JSON.stringify({ error: `iNaturalist API error: ${response.status}` }),
        { status: response.status }
      );
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('iNaturalist fetch error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch from iNaturalist API' }),
      { status: 500 }
    );
  }
}