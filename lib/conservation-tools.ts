export interface Location {
  lat: number;
  lon: number;
  city?: string;
  state?: string;
  country?: string;
  displayName: string;
}

export interface Species {
  id: string;
  commonName: string;
  scientificName: string;
  conservationStatus: string;
  description?: string;
  imageUrl?: string;
  habitat?: string;
}

export interface Organization {
  name: string;
  website?: string;
  description: string;
  location: string;
  contactInfo?: string;
}

export async function geocodeLocation(locationQuery: string): Promise<Location | null> {
  try {
    const encodedQuery = encodeURIComponent(locationQuery);
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&limit=1&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'ConservationAgent/1.0'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Geocoding failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      return null;
    }

    const result = data[0];
    return {
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
      city: result.address?.city || result.address?.town || result.address?.village,
      state: result.address?.state,
      country: result.address?.country,
      displayName: result.display_name
    };
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

export async function findSpeciesByLocation(location: Location): Promise<Species[]> {
  try {
    // Using GBIF API to find species occurrences near the location
    const radius = 50; // 50km radius
    const response = await fetch(
      `https://api.gbif.org/v1/occurrence/search?` +
      `decimalLatitude=${location.lat}&decimalLongitude=${location.lon}&` +
      `radius=${radius}&limit=100&hasCoordinate=true&hasGeospatialIssue=false`
    );

    if (!response.ok) {
      throw new Error(`Species lookup failed: ${response.status}`);
    }

    const data = await response.json();

    // Group by species and prioritize those with conservation concerns
    const speciesMap = new Map<string, Species>();

    for (const occurrence of data.results) {
      if (!occurrence.species || !occurrence.scientificName) continue;

      const key = occurrence.scientificName;
      if (!speciesMap.has(key)) {
        speciesMap.set(key, {
          id: occurrence.speciesKey?.toString() || key,
          commonName: occurrence.vernacularName || occurrence.species || '',
          scientificName: occurrence.scientificName,
          conservationStatus: 'Unknown',
          habitat: occurrence.habitat || ''
        });
      }
    }

    // Convert to array and limit to reasonable number
    const species = Array.from(speciesMap.values()).slice(0, 20);

    // Enhance with conservation status from additional sources if needed
    return species;
  } catch (error) {
    console.error('Species lookup error:', error);
    return [];
  }
}

export async function getSpeciesInfo(species: Species): Promise<Species> {
  try {
    // Get Wikipedia summary and image
    const searchQuery = species.commonName || species.scientificName;
    const searchResponse = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchQuery)}`
    );

    if (searchResponse.ok) {
      const data = await searchResponse.json();
      return {
        ...species,
        description: data.extract || species.description,
        imageUrl: data.thumbnail?.source || species.imageUrl
      };
    }
  } catch (error) {
    console.error('Species info error:', error);
  }

  return species;
}

export async function findConservationOrganizations(
  species: Species,
  location: Location
): Promise<Organization[]> {
  try {
    const tavilyApiKey = process.env.TAVILY_API_KEY;
    if (!tavilyApiKey) {
      throw new Error('TAVILY_API_KEY not found');
    }

    const searchQuery = `"${species.commonName}" conservation organization ${location.city || location.state} wildlife protection`;

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tavilyApiKey}`
      },
      body: JSON.stringify({
        query: searchQuery,
        search_depth: 'basic',
        include_answer: false,
        include_images: false,
        include_raw_content: false,
        max_results: 10
      })
    });

    if (!response.ok) {
      throw new Error(`Organization search failed: ${response.status}`);
    }

    const data = await response.json();

    const organizations: Organization[] = data.results?.map((result: any) => ({
      name: result.title || 'Unknown Organization',
      website: result.url,
      description: result.content || 'Conservation organization',
      location: location.displayName,
      contactInfo: ''
    })) || [];

    return organizations.slice(0, 5); // Limit to top 5 results
  } catch (error) {
    console.error('Organization search error:', error);
    return [];
  }
}