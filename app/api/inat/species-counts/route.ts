import { NextRequest } from 'next/server';

const INAT_BASE = 'https://api.inaturalist.org/v1';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  console.log('🐛 iNATURALIST SPECIES-COUNTS API called with params:', Object.fromEntries(searchParams.entries()));

  // Build query parameters for species counts
  const qs = new URLSearchParams();

  // Geographic filters
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  const radius = searchParams.get('radius') ?? '50'; // km
  const placeId = searchParams.get('place_id');

  if (lat && lng) {
    qs.set('lat', lat);
    qs.set('lng', lng);
    qs.set('radius', radius);
  }
  if (placeId) qs.set('place_id', placeId);

  // Quality filters for reliable data
  qs.set('verifiable', 'true');
  qs.set('quality_grade', 'research');
  qs.set('locale', 'en');

  // Limit to main vertebrate groups for wildlife finder
  const iconicTaxa = searchParams.get('iconic_taxa') ?? 'Mammalia,Aves,Reptilia,Amphibia';
  qs.set('iconic_taxa', iconicTaxa);

  // Pagination
  qs.set('per_page', searchParams.get('per_page') ?? '100');
  qs.set('page', searchParams.get('page') ?? '1');

  const url = `${INAT_BASE}/observations/species_counts?${qs.toString()}`;

  console.log('🌐 FETCHING iNaturalist species counts from:', url);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Wildlife-Finder/1.0 (conservation education tool)'
      },
      // Cache species counts for 10 minutes
      next: { revalidate: 600 }
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('iNaturalist species counts API error:', response.status, text);
      return new Response(
        JSON.stringify({ error: `iNaturalist species counts API error: ${response.status}` }),
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log(`✅ iNaturalist species counts SUCCESS: ${data.results?.length || 0} species found`);
    return Response.json(data);
  } catch (error) {
    console.error('iNaturalist species counts fetch error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch species counts from iNaturalist API' }),
      { status: 500 }
    );
  }
}