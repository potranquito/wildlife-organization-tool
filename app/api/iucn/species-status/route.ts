import { NextRequest, NextResponse } from 'next/server';

/**
 * IUCN Red List API Route
 * Direct integration with the IUCN Red List API v4
 * https://api.iucnredlist.org/api-docs/
 */

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const scientificName = searchParams.get('scientificName');
    const region = searchParams.get('region'); // Optional: for regional assessments

    if (!scientificName) {
      return NextResponse.json(
        { error: 'scientificName parameter is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.IUCN_API_KEY;
    if (!apiKey) {
      console.error('❌ IUCN_API_KEY not found in environment');
      return NextResponse.json(
        { error: 'IUCN API key not configured' },
        { status: 500 }
      );
    }

    console.log(`🔴 IUCN RED LIST API called for species: ${scientificName}`);

    // IUCN Red List API v4 endpoint
    const iucnUrl = `https://api.iucnredlist.org/api/v4/species/${encodeURIComponent(scientificName)}?token=${apiKey}`;

    console.log(`🌐 FETCHING from IUCN Red List API: ${iucnUrl.replace(apiKey, 'REDACTED')}`);

    const response = await fetch(iucnUrl, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`❌ IUCN API error: ${response.status} ${response.statusText}`);

      if (response.status === 404) {
        // Species not found in IUCN database
        return NextResponse.json({
          found: false,
          scientificName,
          message: 'Species not found in IUCN Red List database'
        });
      }

      return NextResponse.json(
        { error: `IUCN API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    console.log(`✅ IUCN RED LIST SUCCESS: ${scientificName} - ${data.result?.[0]?.category || 'Unknown'}`);

    const duration = Date.now() - startTime;
    console.log(`⏱️ IUCN API request completed in ${duration}ms`);

    // Extract the first result (should be the exact match)
    const speciesData = data.result?.[0];

    if (!speciesData) {
      return NextResponse.json({
        found: false,
        scientificName,
        message: 'No data returned from IUCN Red List'
      });
    }

    // Return structured IUCN data
    return NextResponse.json({
      found: true,
      scientificName: speciesData.scientific_name,
      commonName: speciesData.main_common_name,
      category: speciesData.category, // CR, EN, VU, NT, LC, DD, NE
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
      threatCategories: data.threats,
      habitats: data.habitats,
      conservationMeasures: data.conservation_measures
    });

  } catch (error) {
    console.error('IUCN Red List API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from IUCN Red List API' },
      { status: 500 }
    );
  }
}

/**
 * Convert IUCN category code to human-readable label
 */
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
    'EX': 'Extinct'
  };

  return labels[category] || category;
}
