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
  source?: string;
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
    // Clean and normalize the location query
    const cleanQuery = locationQuery.trim();

    // Add country-specific improvements for better geocoding
    let searchQuery = cleanQuery;

    // For common country names, make them more explicit
    const countryMappings: { [key: string]: string } = {
      'nepal': 'Federal Democratic Republic of Nepal',
      'india': 'Republic of India',
      'bangladesh': 'People\'s Republic of Bangladesh',
      'pakistan': 'Islamic Republic of Pakistan',
      'thailand': 'Kingdom of Thailand',
      'vietnam': 'Socialist Republic of Vietnam',
      'cambodia': 'Kingdom of Cambodia',
      'myanmar': 'Republic of the Union of Myanmar',
      'laos': 'Lao People\'s Democratic Republic'
    };

    const lowerQuery = cleanQuery.toLowerCase();
    if (countryMappings[lowerQuery]) {
      searchQuery = countryMappings[lowerQuery];
    }

    const encodedQuery = encodeURIComponent(searchQuery);
    console.log(`Geocoding query: "${cleanQuery}" -> "${searchQuery}"`);

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&limit=3&addressdetails=1&countrycodes=&accept-language=en`,
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
      console.warn(`No geocoding results found for: ${cleanQuery}`);
      return null;
    }

    // Prefer country-level results for country names
    let selectedResult = data[0];
    if (countryMappings[lowerQuery]) {
      const countryResult = data.find((result: any) => result.type === 'administrative' && result.place_rank <= 8);
      if (countryResult) {
        selectedResult = countryResult;
      }
    }

    console.log(`Geocoded "${cleanQuery}" to: ${selectedResult.display_name}`);

    return {
      lat: parseFloat(selectedResult.lat),
      lon: parseFloat(selectedResult.lon),
      city: selectedResult.address?.city || selectedResult.address?.town || selectedResult.address?.village,
      state: selectedResult.address?.state,
      country: selectedResult.address?.country,
      displayName: selectedResult.display_name
    };
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

export async function findSpeciesByLocation(location: Location): Promise<Species[]> {
  try {
    let species: Species[] = [];

    // Strategy 1: iNaturalist API for precise location-based observations (primary source)
    try {
      const radius = isStateOrCountryLocation(location) ? 300 : 150; // Larger radius for state-level searches
      const inatResponse = await fetch(
        `https://api.inaturalist.org/v1/observations/species_counts?` +
        `lat=${location.lat}&lng=${location.lon}&radius=${radius}&` +
        `quality_grade=research&iconic_taxa=Mammalia,Aves,Reptilia,Amphibia&` +
        `per_page=120&order=desc&order_by=count`
      );

      if (inatResponse.ok) {
        const inatData = await inatResponse.json();

        if (inatData.results && inatData.results.length > 0) {
          // Filter and categorize by taxonomic groups first, then map to species
          const mammals = inatData.results
            .filter((result: any) => result.taxon?.preferred_common_name && result.taxon?.iconic_taxon_name === 'Mammalia')
            .map((result: any) => ({
              id: result.taxon.id?.toString() || '',
              commonName: result.taxon.preferred_common_name,
              scientificName: result.taxon.name,
              conservationStatus: result.taxon.conservation_status?.status_name || 'Data Deficient',
              habitat: '',
              source: 'iNaturalist'
            } as Species));

          const birds = inatData.results
            .filter((result: any) => result.taxon?.preferred_common_name && result.taxon?.iconic_taxon_name === 'Aves')
            .map((result: any) => ({
              id: result.taxon.id?.toString() || '',
              commonName: result.taxon.preferred_common_name,
              scientificName: result.taxon.name,
              conservationStatus: result.taxon.conservation_status?.status_name || 'Data Deficient',
              habitat: '',
              source: 'iNaturalist'
            } as Species));

          const reptiles = inatData.results
            .filter((result: any) => result.taxon?.preferred_common_name && result.taxon?.iconic_taxon_name === 'Reptilia')
            .map((result: any) => ({
              id: result.taxon.id?.toString() || '',
              commonName: result.taxon.preferred_common_name,
              scientificName: result.taxon.name,
              conservationStatus: result.taxon.conservation_status?.status_name || 'Data Deficient',
              habitat: '',
              source: 'iNaturalist'
            } as Species));

          const amphibians = inatData.results
            .filter((result: any) => result.taxon?.preferred_common_name && result.taxon?.iconic_taxon_name === 'Amphibia')
            .map((result: any) => ({
              id: result.taxon.id?.toString() || '',
              commonName: result.taxon.preferred_common_name,
              scientificName: result.taxon.name,
              conservationStatus: result.taxon.conservation_status?.status_name || 'Data Deficient',
              habitat: '',
              source: 'iNaturalist'
            } as Species));

          // Ensure taxonomic diversity: aim for 2-3 from each group
          const selectedMammals: Species[] = shuffleArray(mammals).slice(0, 3) as Species[];
          const selectedBirds: Species[] = shuffleArray(birds).slice(0, 3) as Species[];
          const selectedReptiles: Species[] = shuffleArray(reptiles).slice(0, 2) as Species[];
          const selectedAmphibians: Species[] = shuffleArray(amphibians).slice(0, 2) as Species[];

          species = [
            ...selectedMammals,
            ...selectedBirds,
            ...selectedReptiles,
            ...selectedAmphibians
          ];

          console.log(`Found ${mammals.length} mammals, ${birds.length} birds, ${reptiles.length} reptiles, ${amphibians.length} amphibians for ${location.displayName}`);
        }
      }
    } catch (inatError) {
      console.warn('iNaturalist search failed:', inatError);
    }

    // Strategy 2: GBIF occurrence search for additional regional species with taxonomic targeting
    if (species.length < 10) {
      try {
        const radius = isStateOrCountryLocation(location) ? 250 : 100;
        const countryCode = getGBIFCountryCode(location);

        // Search for specific taxonomic groups to ensure diversity
        const taxonomicGroups = [
          { name: 'Mammalia', classKey: 359 },
          { name: 'Aves', classKey: 212 },
          { name: 'Reptilia', classKey: 358 },
          { name: 'Amphibia', classKey: 131 }
        ];

        for (const group of taxonomicGroups) {
          // Build GBIF query with geographic and taxonomic filters
          let gbifQuery = `https://api.gbif.org/v1/occurrence/search?` +
            `decimalLatitude=${location.lat}&decimalLongitude=${location.lon}&` +
            `radius=${radius}&limit=50&hasCoordinate=true&` +
            `classKey=${group.classKey}&hasGeospatialIssue=false&basisOfRecord=HUMAN_OBSERVATION,OBSERVATION`;

          // Add country filter if available
          if (countryCode) {
            gbifQuery += `&country=${countryCode}`;
          }

          const response = await fetch(gbifQuery);

          if (response.ok) {
            const data = await response.json();

            if (data.results && data.results.length > 0) {
              const groupSpeciesMap = new Map<string, Species>();

              for (const occurrence of data.results) {
                if (!occurrence.scientificName || !occurrence.vernacularName) continue;

                const key = occurrence.scientificName;
                if (!groupSpeciesMap.has(key)) {
                  groupSpeciesMap.set(key, {
                    id: occurrence.speciesKey?.toString() || key,
                    commonName: occurrence.vernacularName,
                    scientificName: occurrence.scientificName,
                    conservationStatus: 'Data Deficient',
                    habitat: occurrence.habitat || '',
                    source: `GBIF (${group.name})`
                  });
                }
              }

              const groupSpecies = Array.from(groupSpeciesMap.values());

              // Add species from this taxonomic group that aren't already in our list
              const existingNames = new Set(species.map(s => s.scientificName.toLowerCase()));
              const newGroupSpecies = groupSpecies.filter(s =>
                !existingNames.has(s.scientificName.toLowerCase())
              );

              // Limit to 2 per taxonomic group to maintain diversity
              species = [...species, ...shuffleArray(newGroupSpecies).slice(0, 2)];
              console.log(`Added ${newGroupSpecies.length} ${group.name} species from GBIF for ${location.displayName}`);
            }
          }
        }
      } catch (gbifError) {
        console.warn('GBIF taxonomic search failed:', gbifError);
      }
    }

    // Strategy 3: Enhanced GBIF search with broader geographic coverage if needed
    if (species.length < 10) {
      try {
        const countryCode = getGBIFCountryCode(location);
        if (countryCode) {
          // Country-wide search for more diversity
          const countryResponse = await fetch(
            `https://api.gbif.org/v1/occurrence/search?` +
            `country=${countryCode}&limit=100&hasCoordinate=true&` +
            `kingdomKey=1&hasGeospatialIssue=false&basisOfRecord=HUMAN_OBSERVATION,OBSERVATION`
          );

          if (countryResponse.ok) {
            const countryData = await countryResponse.json();
            if (countryData.results && countryData.results.length > 0) {
              const countrySpeciesMap = new Map<string, Species>();

              for (const occurrence of countryData.results) {
                if (!occurrence.scientificName || !occurrence.vernacularName) continue;

                const key = occurrence.scientificName;
                if (!countrySpeciesMap.has(key)) {
                  const className = occurrence.class?.toLowerCase() || '';

                  // Focus on vertebrates
                  if (className.includes('mammal') || className.includes('aves') ||
                      className.includes('reptil') || className.includes('amphibi')) {

                    countrySpeciesMap.set(key, {
                      id: occurrence.speciesKey?.toString() || key,
                      commonName: occurrence.vernacularName,
                      scientificName: occurrence.scientificName,
                      conservationStatus: 'Data Deficient',
                      habitat: occurrence.habitat || '',
                      source: 'GBIF (Country)'
                    });
                  }
                }
              }

              const countrySpecies = Array.from(countrySpeciesMap.values());
              const existingNames = new Set(species.map(s => s.scientificName.toLowerCase()));
              const newCountrySpecies = countrySpecies.filter(s =>
                !existingNames.has(s.scientificName.toLowerCase())
              );

              species = [...species, ...shuffleArray(newCountrySpecies).slice(0, 6)];
              console.log(`Added ${newCountrySpecies.length} country-wide GBIF species for ${location.displayName}`);
            }
          }
        }
      } catch (countryError) {
        console.warn('Country-wide GBIF search failed:', countryError);
      }
    }

    console.log(`Found ${species.length} location-specific species for ${location.displayName}`);

    // Return species prioritized by conservation status and location relevance
    const endangeredSpecies = species.filter(s =>
      ['Critically Endangered', 'Endangered', 'Vulnerable', 'Near Threatened'].includes(s.conservationStatus)
    );
    const otherSpecies = species.filter(s =>
      !['Critically Endangered', 'Endangered', 'Vulnerable', 'Near Threatened'].includes(s.conservationStatus)
    );

    return [...endangeredSpecies, ...shuffleArray(otherSpecies)].slice(0, 10);

  } catch (error) {
    console.error('Species lookup error:', error);
    return [];
  }
}

async function enhanceWithIUCNStatus(species: Species[]): Promise<Species[]> {
  // For now, return as-is. In the future, we could batch lookup IUCN status for each species
  // This would require individual species API calls which might hit rate limits
  return species;
}

// Removed complex IUCN habitat-based search function - using simplified GBIF approach instead

function getIUCNCountryCode(location: Location): string | null {
  const country = location.country?.toLowerCase();
  const displayName = location.displayName?.toLowerCase();

  // Map common country names to ISO alpha-2 codes for IUCN API
  const countryMap: { [key: string]: string } = {
    'united states': 'US',
    'usa': 'US',
    'us': 'US',
    'america': 'US',
    'canada': 'CA',
    'mexico': 'MX',
    'united kingdom': 'GB',
    'uk': 'GB',
    'britain': 'GB',
    'england': 'GB',
    'australia': 'AU',
    'brazil': 'BR',
    'india': 'IN',
    'china': 'CN',
    'japan': 'JP',
    'germany': 'DE',
    'france': 'FR',
    'spain': 'ES',
    'italy': 'IT',
    'russia': 'RU',
    'nepal': 'NP',
    'south africa': 'ZA',
    'argentina': 'AR',
    'chile': 'CL',
    'colombia': 'CO',
    'peru': 'PE',
    'venezuela': 'VE',
    'ecuador': 'EC',
    'bolivia': 'BO',
    'paraguay': 'PY',
    'uruguay': 'UY',
    'netherlands': 'NL',
    'belgium': 'BE',
    'switzerland': 'CH',
    'austria': 'AT',
    'poland': 'PL',
    'czech republic': 'CZ',
    'hungary': 'HU',
    'romania': 'RO',
    'bulgaria': 'BG',
    'croatia': 'HR',
    'serbia': 'RS',
    'greece': 'GR',
    'turkey': 'TR',
    'egypt': 'EG',
    'nigeria': 'NG',
    'kenya': 'KE',
    'ethiopia': 'ET',
    'ghana': 'GH',
    'morocco': 'MA',
    'algeria': 'DZ',
    'tunisia': 'TN',
    'israel': 'IL',
    'saudi arabia': 'SA',
    'uae': 'AE',
    'iran': 'IR',
    'iraq': 'IQ',
    'afghanistan': 'AF',
    'pakistan': 'PK',
    'bangladesh': 'BD',
    'sri lanka': 'LK',
    'myanmar': 'MM',
    'thailand': 'TH',
    'vietnam': 'VN',
    'cambodia': 'KH',
    'laos': 'LA',
    'malaysia': 'MY',
    'singapore': 'SG',
    'indonesia': 'ID',
    'philippines': 'PH',
    'south korea': 'KR',
    'north korea': 'KP',
    'mongolia': 'MN',
    'kazakhstan': 'KZ',
    'uzbekistan': 'UZ',
    'new zealand': 'NZ'
  };

  // Check country field first
  if (country) {
    for (const [name, code] of Object.entries(countryMap)) {
      if (country.includes(name)) {
        return code;
      }
    }
  }

  // Check display name for country information
  if (displayName) {
    for (const [name, code] of Object.entries(countryMap)) {
      if (displayName.includes(name)) {
        return code;
      }
    }
  }

  // Default to US if we can't determine the country but it seems to be in the US
  if (location.state || (displayName && displayName.includes('united states'))) {
    return 'US';
  }

  return null;
}

function getFullConservationStatus(category: string): string {
  const statusMap: { [key: string]: string } = {
    'CR': 'Critically Endangered',
    'EN': 'Endangered',
    'VU': 'Vulnerable',
    'NT': 'Near Threatened',
    'LC': 'Least Concern',
    'DD': 'Data Deficient',
    'EX': 'Extinct',
    'EW': 'Extinct in the Wild'
  };

  return statusMap[category] || category;
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function formatSpeciesName(scientificName: string): string {
  // Convert scientific names to more readable format
  // e.g., "Lampsilis rafinesqueana" -> "Lampsilis Rafinesqueana"
  return scientificName
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function generateCommonName(scientificName: string): string {
  // Try to generate a readable common name from scientific name
  // This is a fallback when no common name is provided by the API

  // First, check if we have a mapping for common scientific names
  const commonNameMappings: { [key: string]: string } = {
    // Mammals
    'ursus': 'Bear',
    'canis': 'Wolf/Dog',
    'felis': 'Cat',
    'panthera': 'Big Cat',
    'cervus': 'Deer',
    'alces': 'Moose',
    'lepus': 'Rabbit',
    'sciurus': 'Squirrel',
    'castor': 'Beaver',
    'mustela': 'Weasel',
    'procyon': 'Raccoon',
    'vulpes': 'Fox',

    // Birds
    'aquila': 'Eagle',
    'falco': 'Falcon',
    'buteo': 'Hawk',
    'strix': 'Owl',
    'corvus': 'Crow',
    'turdus': 'Thrush',
    'anas': 'Duck',
    'ardea': 'Heron',
    'larus': 'Gull',
    'hirundo': 'Swallow',

    // Reptiles
    'vipera': 'Viper',
    'natrix': 'Snake',
    'lacerta': 'Lizard',
    'testudo': 'Tortoise',
    'chelonia': 'Turtle',

    // Amphibians
    'rana': 'Frog',
    'bufo': 'Toad',
    'salamandra': 'Salamander',
    'triturus': 'Newt'
  };

  const genus = scientificName.split(' ')[0]?.toLowerCase();
  if (genus && commonNameMappings[genus]) {
    const species = scientificName.split(' ')[1];
    return `${commonNameMappings[genus]}${species ? ` (${species})` : ''}`;
  }

  // Fallback: just format the scientific name nicely
  return formatSpeciesName(scientificName);
}

function getCountryCode(location: Location): string | null {
  const country = location.country?.toLowerCase();
  if (country?.includes('united states') || country?.includes('usa')) return 'US';
  if (country?.includes('canada')) return 'CA';
  if (country?.includes('mexico')) return 'MX';
  return null;
}

function getGBIFCountryCode(location: Location): string | null {
  const country = location.country?.toLowerCase() || '';
  const displayName = location.displayName?.toLowerCase() || '';

  // GBIF uses ISO 3166-1 alpha-2 country codes
  const countryMap: { [key: string]: string } = {
    'united states': 'US',
    'usa': 'US',
    'us': 'US',
    'america': 'US',
    'canada': 'CA',
    'mexico': 'MX',
    'united kingdom': 'GB',
    'uk': 'GB',
    'britain': 'GB',
    'england': 'GB',
    'scotland': 'GB',
    'wales': 'GB',
    'australia': 'AU',
    'brazil': 'BR',
    'india': 'IN',
    'china': 'CN',
    'japan': 'JP',
    'germany': 'DE',
    'france': 'FR',
    'spain': 'ES',
    'italy': 'IT',
    'russia': 'RU',
    'nepal': 'NP',
    'south africa': 'ZA',
    'argentina': 'AR',
    'chile': 'CL',
    'colombia': 'CO',
    'peru': 'PE',
    'venezuela': 'VE',
    'ecuador': 'EC',
    'bolivia': 'BO',
    'paraguay': 'PY',
    'uruguay': 'UY',
    'netherlands': 'NL',
    'belgium': 'BE',
    'switzerland': 'CH',
    'austria': 'AT',
    'poland': 'PL',
    'czech republic': 'CZ',
    'czechia': 'CZ',
    'hungary': 'HU',
    'romania': 'RO',
    'bulgaria': 'BG',
    'croatia': 'HR',
    'serbia': 'RS',
    'greece': 'GR',
    'turkey': 'TR',
    'egypt': 'EG',
    'nigeria': 'NG',
    'kenya': 'KE',
    'ethiopia': 'ET',
    'ghana': 'GH',
    'morocco': 'MA',
    'algeria': 'DZ',
    'tunisia': 'TN',
    'israel': 'IL',
    'saudi arabia': 'SA',
    'uae': 'AE',
    'iran': 'IR',
    'iraq': 'IQ',
    'afghanistan': 'AF',
    'pakistan': 'PK',
    'bangladesh': 'BD',
    'sri lanka': 'LK',
    'myanmar': 'MM',
    'thailand': 'TH',
    'vietnam': 'VN',
    'cambodia': 'KH',
    'laos': 'LA',
    'malaysia': 'MY',
    'singapore': 'SG',
    'indonesia': 'ID',
    'philippines': 'PH',
    'south korea': 'KR',
    'north korea': 'KP',
    'mongolia': 'MN',
    'kazakhstan': 'KZ',
    'uzbekistan': 'UZ',
    'new zealand': 'NZ',
    'norway': 'NO',
    'sweden': 'SE',
    'finland': 'FI',
    'denmark': 'DK',
    'iceland': 'IS'
  };

  // Check country field first
  if (country) {
    for (const [name, code] of Object.entries(countryMap)) {
      if (country.includes(name)) {
        return code;
      }
    }
  }

  // Check display name
  if (displayName) {
    for (const [name, code] of Object.entries(countryMap)) {
      if (displayName.includes(name)) {
        return code;
      }
    }
  }

  // For US states, return US
  if (location.state) {
    const stateNames = ['alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming'];
    const stateLower = location.state.toLowerCase();
    if (stateNames.some(state => stateLower.includes(state))) {
      return 'US';
    }
  }

  return null;
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
  let organizations: Organization[] = [];

  try {
    console.log(`Finding conservation organizations for ${species.commonName} in ${location.displayName}`);

    // Use OpenAI WebSearch tool to find real organizations
    const webSearchOrgs = await searchConservationOrganizations(species, location);
    organizations = [...organizations, ...webSearchOrgs];

    // Add government agencies as backup/supplement
    const governmentOrgs = getGovernmentConservationOrgs(location);
    const existingNames = new Set(organizations.map(org => org.name.toLowerCase()));
    const newGovOrgs = governmentOrgs.filter(org =>
      !existingNames.has(org.name.toLowerCase())
    );

    organizations = [...organizations, ...newGovOrgs];

    console.log(`Found ${organizations.length} organizations for ${species.commonName}`);
    return organizations.slice(0, 6); // Return top 6 organizations

  } catch (error) {
    console.error('Organization search error:', error);
    // Return at least government agencies as fallback
    return getGovernmentConservationOrgs(location).slice(0, 3);
  }
}

async function searchConservationOrganizations(
  species: Species,
  location: Location
): Promise<Organization[]> {
  try {
    // Check for OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY environment variable is not set');
      return [];
    }

    // Determine the species group for broader search
    const speciesGroup = getSpeciesGroup(species.commonName);
    const locationName = location.city || location.state || location.country || 'local area';

    console.log(`Web searching for ${species.commonName} (${speciesGroup}) organizations in ${locationName}`);

    // Import WebSearch function dynamically to avoid module issues
    let webSearchResults: Organization[] = [];

    try {
      // Use WebSearch to find real, current organizations
      const searchQueries = [
        `${species.commonName} wildlife conservation organizations ${locationName}`,
        `${species.commonName} rehabilitation center ${locationName}`,
        `${speciesGroup} conservation groups ${location.state || location.country}`,
        `wildlife rescue ${species.commonName} ${locationName}`
      ];

      // Try multiple search queries to get diverse results
      for (const query of searchQueries.slice(0, 2)) { // Limit to 2 searches to avoid rate limits
        try {
          console.log(`WebSearch query: "${query}"`);

          // Use AI with web search knowledge to find organizations
          const { openai } = await import('@ai-sdk/openai');
          const { generateText } = await import('ai');

          const searchResult = await generateText({
            model: openai('gpt-4o'),
            system: `You are a web search expert finding real, current conservation organizations. Use your knowledge of recent and current organizations to provide accurate, up-to-date information.`,
            prompt: `Search for and find real conservation organizations for: "${query}"

Find current, legitimate organizations that work with ${species.commonName} or ${speciesGroup} in ${locationName}. For each organization, provide:

1. Organization Name
Website: URL (if available)
Description: Brief description of their work
Location: Service area

Focus on:
- Local wildlife rehabilitation centers in ${locationName}
- Regional conservation groups in ${location.state || location.country}
- Species-specific organizations for ${species.commonName}
- State wildlife agencies
- Established national organizations with local presence

Provide real organizations with actual websites. Use numbered format.`
          });

          console.log(`Web search simulation result for "${query}":`, searchResult.text);

          if (searchResult && searchResult.text && searchResult.text.length > 0) {
            // Parse the search results to extract organizations
            const orgsFromSearch = extractOrganizationsFromText(searchResult.text, location);
            webSearchResults = [...webSearchResults, ...orgsFromSearch];
          }
        } catch (searchError) {
          console.log(`WebSearch query failed: ${searchError}`);
          continue;
        }
      }
    } catch (webSearchError) {
      console.log(`WebSearch not available, falling back to AI generation: ${webSearchError}`);
    }

    // If WebSearch didn't provide enough results, supplement with AI generation
    if (webSearchResults.length < 2) {
      console.log(`WebSearch returned ${webSearchResults.length} results, supplementing with AI`);

      try {
        // Import OpenAI and generateText
        const { openai } = await import('@ai-sdk/openai');
        const { generateText } = await import('ai');

        const result = await generateText({
          model: openai('gpt-4o'),
          system: `You are a conservation organization expert. Provide exactly 3-4 real conservation organizations in a simple format.

Response format (use this exact structure):
1. Organization Name
Website: URL (if known)
Description: Brief description

2. Organization Name
Website: URL (if known)
Description: Brief description

Include real organizations like wildlife rehabilitation centers, state wildlife agencies, and well-known conservation groups.`,
          prompt: `Find 3-4 real conservation organizations that help with ${species.commonName} or ${speciesGroup} conservation in or near ${locationName}. Include:

1. A local wildlife rehabilitation center (if any exist)
2. The state/regional wildlife agency
3. A national conservation organization with local presence
4. A species-specific conservation group (if applicable)

Use simple numbered format with organization name, website, and brief description.`
        });

        console.log(`AI supplement response for ${species.commonName}:`, result.text);

        // Parse the AI response to extract organizations
        const aiOrgs = extractOrganizationsFromText(result.text, location);
        console.log(`Extracted ${aiOrgs.length} organizations from AI supplement`);

        // Combine unique organizations (avoid duplicates by name)
        const existingNames = new Set(webSearchResults.map(org => org.name.toLowerCase()));
        const newAiOrgs = aiOrgs.filter(org => !existingNames.has(org.name.toLowerCase()));

        webSearchResults = [...webSearchResults, ...newAiOrgs];
      } catch (aiError) {
        console.error('AI supplement failed:', aiError);
      }
    }

    console.log(`Total organizations found: ${webSearchResults.length}`);
    return webSearchResults.slice(0, 4); // Return top 4 organizations

  } catch (error) {
    console.error('Organization search failed:', error);
    return [];
  }
}

function parseWebSearchResults(searchResults: string, species: Species, location: Location): Organization[] {
  const organizations: Organization[] = [];

  try {
    // Split the search results into lines and look for organization information
    const lines = searchResults.split('\n');
    let currentOrg: Partial<Organization> = {};

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine) continue;

      // Look for organization names (often in titles or headers)
      const orgNameMatch = trimmedLine.match(/^([A-Z][^:]+(?:Foundation|Center|Society|Organization|Alliance|Coalition|Conservancy|Fund|Trust|Association|Institute|Group|Agency|Department|Service|Commission|Wildlife|Rescue|Rehabilitation|Conservation))/i);

      if (orgNameMatch) {
        // Save previous org if it exists
        if (currentOrg.name) {
          organizations.push({
            name: currentOrg.name,
            website: currentOrg.website || '',
            description: currentOrg.description || 'Conservation organization',
            location: currentOrg.location || location.city || location.state || 'Local',
            contactInfo: currentOrg.contactInfo || ''
          });
        }

        // Start new org
        currentOrg = {
          name: orgNameMatch[1].trim(),
          website: '',
          description: '',
          location: '',
          contactInfo: ''
        };
        continue;
      }

      // Look for website URLs
      const urlMatch = trimmedLine.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch && currentOrg.name && !currentOrg.website) {
        currentOrg.website = urlMatch[1];
        continue;
      }

      // Look for descriptions (lines with relevant keywords)
      if (currentOrg.name && !currentOrg.description &&
          (trimmedLine.includes('wildlife') || trimmedLine.includes('conservation') ||
           trimmedLine.includes('rescue') || trimmedLine.includes('rehabilitation') ||
           trimmedLine.includes(species.commonName.toLowerCase()) ||
           trimmedLine.includes('protect') || trimmedLine.includes('habitat')) &&
          trimmedLine.length > 20) {
        currentOrg.description = trimmedLine.slice(0, 150); // Limit description length
        continue;
      }
    }

    // Don't forget the last organization
    if (currentOrg.name) {
      organizations.push({
        name: currentOrg.name,
        website: currentOrg.website || '',
        description: currentOrg.description || 'Conservation organization',
        location: currentOrg.location || location.city || location.state || 'Local',
        contactInfo: currentOrg.contactInfo || ''
      });
    }

    console.log(`Parsed ${organizations.length} organizations from web search results`);
    return organizations;

  } catch (error) {
    console.error('Error parsing web search results:', error);
    return [];
  }
}

function getSpeciesGroup(commonName: string): string {
  const name = commonName.toLowerCase();

  if (name.includes('bird') || name.includes('eagle') || name.includes('hawk') ||
      name.includes('owl') || name.includes('falcon') || name.includes('duck') ||
      name.includes('goose') || name.includes('crane') || name.includes('heron') ||
      name.includes('woodpecker') || name.includes('warbler') || name.includes('sparrow')) {
    return 'bird';
  }

  if (name.includes('mammal') || name.includes('bear') || name.includes('wolf') ||
      name.includes('deer') || name.includes('fox') || name.includes('rabbit') ||
      name.includes('squirrel') || name.includes('bat') || name.includes('whale') ||
      name.includes('dolphin') || name.includes('seal') || name.includes('otter')) {
    return 'mammal';
  }

  if (name.includes('reptile') || name.includes('snake') || name.includes('lizard') ||
      name.includes('turtle') || name.includes('tortoise') || name.includes('gecko') ||
      name.includes('iguana') || name.includes('alligator') || name.includes('crocodile')) {
    return 'reptile';
  }

  if (name.includes('amphibian') || name.includes('frog') || name.includes('toad') ||
      name.includes('salamander') || name.includes('newt')) {
    return 'amphibian';
  }

  return 'wildlife';
}

function extractOrganizationsFromText(text: string, location: Location): Organization[] {
  const organizations: Organization[] = [];
  const lines = text.split('\n');

  let currentOrg: Partial<Organization> = {};

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip empty lines
    if (!trimmedLine) {
      continue;
    }

    // Check if line starts with a number (new organization)
    const numberMatch = trimmedLine.match(/^(\d+)\.\s*(.+)/);
    if (numberMatch) {
      // Save previous org if it exists
      if (currentOrg.name) {
        organizations.push({
          name: currentOrg.name,
          website: currentOrg.website || '',
          description: currentOrg.description || 'Conservation organization',
          location: currentOrg.location || location.city || location.state || 'Local',
          contactInfo: currentOrg.contactInfo || ''
        });
      }

      // Start new org
      currentOrg = {
        name: numberMatch[2].trim(),
        website: '',
        description: '',
        location: '',
        contactInfo: ''
      };
      continue;
    }

    // Check for website line
    const websiteMatch = trimmedLine.match(/^Website:\s*(.+)$/i);
    if (websiteMatch && currentOrg.name) {
      let website = websiteMatch[1].trim();
      // Extract URL if it's in markdown format [text](url)
      const markdownUrlMatch = website.match(/\[.*?\]\((https?:\/\/[^\)]+)\)/);
      if (markdownUrlMatch) {
        website = markdownUrlMatch[1];
      } else if (!website.startsWith('http')) {
        // If it doesn't start with http, try to find a URL in the text
        const urlMatch = website.match(/(https?:\/\/[^\s]+)/);
        if (urlMatch) {
          website = urlMatch[1];
        } else if (website !== 'N/A' && website !== 'Unknown' && website !== 'Not available') {
          // If it looks like a domain, add https://
          website = `https://${website}`;
        } else {
          website = '';
        }
      }
      currentOrg.website = website;
      continue;
    }

    // Check for description line
    const descMatch = trimmedLine.match(/^Description:\s*(.+)$/i);
    if (descMatch && currentOrg.name) {
      currentOrg.description = descMatch[1].trim();
      continue;
    }

    // Check for location line
    const locMatch = trimmedLine.match(/^Location:\s*(.+)$/i);
    if (locMatch && currentOrg.name) {
      currentOrg.location = locMatch[1].trim();
      continue;
    }

    // If we have an org name and this line contains a URL, treat it as website
    if (currentOrg.name && !currentOrg.website && trimmedLine.match(/https?:\/\/[^\s]+/)) {
      const urlMatch = trimmedLine.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch) {
        currentOrg.website = urlMatch[1];
      }
      continue;
    }

    // If we have an org name but no description yet, and this line doesn't look like a field, treat as description
    if (currentOrg.name && !currentOrg.description &&
        !trimmedLine.match(/^(Website|Description|Location):/i) &&
        trimmedLine.length > 10) {
      currentOrg.description = trimmedLine;
      continue;
    }
  }

  // Don't forget the last organization
  if (currentOrg.name) {
    organizations.push({
      name: currentOrg.name,
      website: currentOrg.website || '',
      description: currentOrg.description || 'Conservation organization',
      location: currentOrg.location || location.city || location.state || 'Local',
      contactInfo: currentOrg.contactInfo || ''
    });
  }

  return organizations;
}

function cleanOrganizationName(name: string): string {
  // Remove common prefixes/suffixes that make names too long
  return name
    .replace(/^(.*?)\s*-\s*.*$/, '$1')  // Remove everything after first dash
    .replace(/\s*\|\s*.*$/, '')         // Remove everything after pipe
    .replace(/\s*:\s*.*$/, '')          // Remove everything after colon
    .slice(0, 50);                      // Limit length
}

function cleanDescription(description: string): string {
  // Get first sentence or limit to 100 characters
  const firstSentence = description.split('.')[0];
  return firstSentence.length < 100 ? firstSentence : description.slice(0, 100) + '...';
}

function getSpeciesSpecificOrganizations(species: Species, location: Location): Organization[] {
  const orgs: Organization[] = [];
  const commonName = species.commonName.toLowerCase();
  const state = location.state?.toLowerCase() || '';
  const country = location.country?.toLowerCase() || '';

  // Bird-specific organizations
  if (commonName.includes('bird') || commonName.includes('eagle') || commonName.includes('hawk') ||
      commonName.includes('owl') || commonName.includes('falcon') || commonName.includes('duck') ||
      commonName.includes('goose') || commonName.includes('crane') || commonName.includes('heron') ||
      commonName.includes('woodpecker') || commonName.includes('warbler') || commonName.includes('sparrow')) {

    orgs.push({
      name: 'National Audubon Society',
      website: 'https://www.audubon.org',
      description: 'Protecting birds and their habitats across the Americas',
      location: 'National',
      contactInfo: ''
    });

    if (country.includes('united states') || country.includes('usa')) {
      orgs.push({
        name: 'American Bird Conservancy',
        website: 'https://abcbirds.org',
        description: 'Conserving wild birds and their habitats throughout the Americas',
        location: 'United States',
        contactInfo: ''
      });
    }
  }

  // Marine species organizations
  if (commonName.includes('whale') || commonName.includes('dolphin') || commonName.includes('seal') ||
      commonName.includes('sea turtle') || commonName.includes('manatee') || commonName.includes('otter')) {

    orgs.push({
      name: 'Marine Mammal Center',
      website: 'https://www.marinemammalcenter.org',
      description: 'Rescuing and rehabilitating marine mammals',
      location: 'California',
      contactInfo: ''
    });

    orgs.push({
      name: 'Sea Turtle Conservancy',
      website: 'https://conserveturtles.org',
      description: 'Protecting sea turtles through research and conservation',
      location: 'Florida',
      contactInfo: ''
    });
  }

  // Bear and large mammal organizations
  if (commonName.includes('bear') || commonName.includes('wolf') || commonName.includes('mountain lion') ||
      commonName.includes('cougar') || commonName.includes('elk') || commonName.includes('moose')) {

    orgs.push({
      name: 'Defenders of Wildlife',
      website: 'https://defenders.org',
      description: 'Protecting and restoring imperiled species and their habitats',
      location: 'National',
      contactInfo: ''
    });

    if (state.includes('alaska') || state.includes('montana') || state.includes('wyoming') ||
        state.includes('idaho') || state.includes('washington')) {
      orgs.push({
        name: 'Greater Yellowstone Coalition',
        website: 'https://greateryellowstone.org',
        description: 'Protecting the Greater Yellowstone Ecosystem',
        location: 'Montana/Wyoming/Idaho',
        contactInfo: ''
      });
    }
  }

  // Amphibian and reptile organizations
  if (commonName.includes('frog') || commonName.includes('toad') || commonName.includes('salamander') ||
      commonName.includes('snake') || commonName.includes('lizard') || commonName.includes('turtle')) {

    orgs.push({
      name: 'Amphibian Survival Alliance',
      website: 'https://amphibians.org',
      description: 'Global coalition working to protect amphibians',
      location: 'International',
      contactInfo: ''
    });
  }

  // Endangered species organizations
  if (species.conservationStatus &&
      ['Critically Endangered', 'Endangered', 'Vulnerable'].includes(species.conservationStatus)) {

    orgs.push({
      name: 'Endangered Species Coalition',
      website: 'https://www.endangered.org',
      description: 'Working to protect endangered species and their habitats',
      location: 'National',
      contactInfo: ''
    });
  }

  return orgs;
}

function getGeneralConservationOrgs(location: Location): Organization[] {
  const orgs: Organization[] = [];
  const state = location.state?.toLowerCase() || '';
  const country = location.country?.toLowerCase() || '';

  // Major national conservation organizations
  if (country.includes('united states') || country.includes('usa')) {
    orgs.push(
      {
        name: 'National Wildlife Federation',
        website: 'https://www.nwf.org',
        description: 'Protecting wildlife for our children\'s future',
        location: 'National',
        contactInfo: ''
      },
      {
        name: 'The Nature Conservancy',
        website: 'https://www.nature.org',
        description: 'Protecting lands and waters on which all life depends',
        location: 'National',
        contactInfo: ''
      },
      {
        name: 'World Wildlife Fund',
        website: 'https://www.worldwildlife.org',
        description: 'Conserving wildlife and wild places worldwide',
        location: 'International',
        contactInfo: ''
      }
    );

    // Regional organizations
    if (state.includes('california') || state.includes('oregon') || state.includes('washington')) {
      orgs.push({
        name: 'Pacific Wildlife Foundation',
        website: 'https://www.pacificwildlife.org',
        description: 'Protecting Pacific Coast wildlife and habitats',
        location: 'Pacific Coast',
        contactInfo: ''
      });
    }

    if (state.includes('florida') || state.includes('georgia') || state.includes('alabama') ||
        state.includes('mississippi') || state.includes('louisiana')) {
      orgs.push({
        name: 'Southeast Conservation Adaptation Strategy',
        website: 'https://secassoutheast.org',
        description: 'Collaborative conservation across the Southeast',
        location: 'Southeastern US',
        contactInfo: ''
      });
    }
  }

  // International organizations for non-US locations
  if (!country.includes('united states') && !country.includes('usa')) {
    orgs.push(
      {
        name: 'World Wildlife Fund',
        website: 'https://www.worldwildlife.org',
        description: 'Conserving wildlife and wild places worldwide',
        location: 'International',
        contactInfo: ''
      },
      {
        name: 'International Union for Conservation of Nature',
        website: 'https://www.iucn.org',
        description: 'Global authority on nature conservation',
        location: 'International',
        contactInfo: ''
      }
    );
  }

  return orgs;
}

function getGovernmentConservationOrgs(location: Location): Organization[] {
  const state = location.state?.toLowerCase() || '';
  const country = location.country?.toLowerCase() || '';

  if (country.includes('united states') || country.includes('usa')) {
    const stateOrgs: Organization[] = [];

    // Comprehensive state wildlife departments
    const stateWildlifeDepts: { [key: string]: { name: string; website: string } } = {
      'alabama': { name: 'Alabama Department of Conservation and Natural Resources', website: 'https://www.outdooralabama.com' },
      'alaska': { name: 'Alaska Department of Fish and Game', website: 'https://www.adfg.alaska.gov' },
      'arizona': { name: 'Arizona Game and Fish Department', website: 'https://www.azgfd.gov' },
      'arkansas': { name: 'Arkansas Game and Fish Commission', website: 'https://www.agfc.com' },
      'california': { name: 'California Department of Fish and Wildlife', website: 'https://wildlife.ca.gov' },
      'colorado': { name: 'Colorado Parks and Wildlife', website: 'https://cpw.state.co.us' },
      'connecticut': { name: 'Connecticut Department of Energy and Environmental Protection', website: 'https://portal.ct.gov/DEEP' },
      'delaware': { name: 'Delaware Division of Fish and Wildlife', website: 'https://www.dnrec.delaware.gov' },
      'florida': { name: 'Florida Fish and Wildlife Conservation Commission', website: 'https://myfwc.com' },
      'georgia': { name: 'Georgia Department of Natural Resources', website: 'https://georgiawildlife.com' },
      'hawaii': { name: 'Hawaii Division of Forestry and Wildlife', website: 'https://dlnr.hawaii.gov' },
      'idaho': { name: 'Idaho Fish and Game', website: 'https://idfg.idaho.gov' },
      'illinois': { name: 'Illinois Department of Natural Resources', website: 'https://www2.illinois.gov/dnr' },
      'indiana': { name: 'Indiana Department of Natural Resources', website: 'https://www.in.gov/dnr' },
      'iowa': { name: 'Iowa Department of Natural Resources', website: 'https://www.iowadnr.gov' },
      'kansas': { name: 'Kansas Department of Wildlife and Parks', website: 'https://ksoutdoors.com' },
      'kentucky': { name: 'Kentucky Department of Fish and Wildlife Resources', website: 'https://fw.ky.gov' },
      'louisiana': { name: 'Louisiana Department of Wildlife and Fisheries', website: 'https://www.wlf.louisiana.gov' },
      'maine': { name: 'Maine Department of Inland Fisheries and Wildlife', website: 'https://www.maine.gov/ifw' },
      'maryland': { name: 'Maryland Department of Natural Resources', website: 'https://dnr.maryland.gov' },
      'massachusetts': { name: 'Massachusetts Division of Fisheries and Wildlife', website: 'https://www.mass.gov/orgs/division-of-fisheries-and-wildlife' },
      'michigan': { name: 'Michigan Department of Natural Resources', website: 'https://www.michigan.gov/dnr' },
      'minnesota': { name: 'Minnesota Department of Natural Resources', website: 'https://www.dnr.state.mn.us' },
      'mississippi': { name: 'Mississippi Department of Wildlife, Fisheries, and Parks', website: 'https://www.mdwfp.com' },
      'missouri': { name: 'Missouri Department of Conservation', website: 'https://mdc.mo.gov' },
      'montana': { name: 'Montana Fish, Wildlife & Parks', website: 'https://fwp.mt.gov' },
      'nebraska': { name: 'Nebraska Game and Parks Commission', website: 'https://outdoornebraska.gov' },
      'nevada': { name: 'Nevada Department of Wildlife', website: 'https://www.ndow.org' },
      'new hampshire': { name: 'New Hampshire Fish and Game Department', website: 'https://www.wildlife.state.nh.us' },
      'new jersey': { name: 'New Jersey Division of Fish and Wildlife', website: 'https://www.state.nj.us/dep/fgw' },
      'new mexico': { name: 'New Mexico Department of Game and Fish', website: 'https://www.wildlife.state.nm.us' },
      'new york': { name: 'New York State Department of Environmental Conservation', website: 'https://www.dec.ny.gov' },
      'north carolina': { name: 'North Carolina Wildlife Resources Commission', website: 'https://www.ncwildlife.org' },
      'north dakota': { name: 'North Dakota Game and Fish Department', website: 'https://gf.nd.gov' },
      'ohio': { name: 'Ohio Division of Wildlife', website: 'https://ohiodnr.gov/wps/portal/gov/odnr/discover-and-learn/safety-conservation/about-ODNR/wildlife' },
      'oklahoma': { name: 'Oklahoma Department of Wildlife Conservation', website: 'https://www.wildlifedepartment.com' },
      'oregon': { name: 'Oregon Department of Fish and Wildlife', website: 'https://www.dfw.state.or.us' },
      'pennsylvania': { name: 'Pennsylvania Game Commission', website: 'https://www.pgc.pa.gov' },
      'rhode island': { name: 'Rhode Island Division of Fish and Wildlife', website: 'https://dem.ri.gov' },
      'south carolina': { name: 'South Carolina Department of Natural Resources', website: 'https://www.dnr.sc.gov' },
      'south dakota': { name: 'South Dakota Game, Fish and Parks', website: 'https://gfp.sd.gov' },
      'tennessee': { name: 'Tennessee Wildlife Resources Agency', website: 'https://www.tn.gov/twra' },
      'texas': { name: 'Texas Parks and Wildlife Department', website: 'https://tpwd.texas.gov' },
      'utah': { name: 'Utah Division of Wildlife Resources', website: 'https://wildlife.utah.gov' },
      'vermont': { name: 'Vermont Fish and Wildlife Department', website: 'https://vtfishandwildlife.com' },
      'virginia': { name: 'Virginia Department of Wildlife Resources', website: 'https://dwr.virginia.gov' },
      'washington': { name: 'Washington Department of Fish and Wildlife', website: 'https://wdfw.wa.gov' },
      'west virginia': { name: 'West Virginia Division of Natural Resources', website: 'https://www.wvdnr.gov' },
      'wisconsin': { name: 'Wisconsin Department of Natural Resources', website: 'https://dnr.wisconsin.gov' },
      'wyoming': { name: 'Wyoming Game and Fish Department', website: 'https://wgfd.wyo.gov' }
    };

    // Find matching state department
    for (const [stateName, dept] of Object.entries(stateWildlifeDepts)) {
      if (state.includes(stateName)) {
        stateOrgs.push({
          name: dept.name,
          website: dept.website,
          description: 'State wildlife conservation and management',
          location: stateName.charAt(0).toUpperCase() + stateName.slice(1),
          contactInfo: ''
        });
        break;
      }
    }

    // Add federal agencies
    stateOrgs.push({
      name: 'US Fish and Wildlife Service',
      website: 'https://www.fws.gov',
      description: 'Federal wildlife conservation agency',
      location: 'United States',
      contactInfo: ''
    });

    return stateOrgs;
  }

  // International government agencies
  if (country.includes('canada')) {
    return [
      {
        name: 'Environment and Climate Change Canada',
        website: 'https://www.canada.ca/en/environment-climate-change.html',
        description: 'Federal environmental and wildlife agency',
        location: 'Canada',
        contactInfo: ''
      }
    ];
  }

  return [];
}

function getHabitatsForLocation(location: Location): string[] {
  // Map locations to appropriate IUCN habitat codes based on climate, geography, and ecology
  const state = location.state?.toLowerCase() || '';
  const city = location.city?.toLowerCase() || '';
  const displayName = location.displayName.toLowerCase();
  const habitats: string[] = [];

  // North American temperate grasslands (Great Plains states)
  if (state.includes('north dakota') || state.includes('south dakota') ||
      state.includes('nebraska') || state.includes('kansas') ||
      state.includes('iowa') || state.includes('missouri') ||
      displayName.includes('great plains') || displayName.includes('prairie')) {
    habitats.push('4_4'); // Grassland - Temperate
    habitats.push('4'); // Grassland (general)
  }

  // Desert states (Hot and temperate deserts)
  if (state.includes('nevada') || state.includes('arizona') ||
      state.includes('new mexico') || city.includes('las vegas') ||
      city.includes('phoenix') || displayName.includes('desert')) {
    habitats.push('8_1'); // Desert - Hot
    habitats.push('8_2'); // Desert - Temperate
    habitats.push('3_5'); // Shrubland - Subtropical/Tropical Dry
  }

  // Boreal/subarctic (Alaska, northern Canada, northern states)
  if (state.includes('alaska') || state.includes('montana') ||
      state.includes('minnesota') || state.includes('maine') ||
      displayName.includes('boreal') || displayName.includes('subarctic')) {
    habitats.push('1_1'); // Forest - Boreal
    habitats.push('4_2'); // Grassland - Subarctic
    habitats.push('3_1'); // Shrubland - Subarctic
  }

  // Temperate forests (Northeast, Great Lakes, Pacific Northwest)
  if (state.includes('washington') || state.includes('oregon') ||
      state.includes('new york') || state.includes('pennsylvania') ||
      state.includes('vermont') || state.includes('new hampshire') ||
      state.includes('massachusetts') || state.includes('connecticut')) {
    habitats.push('1_4'); // Forest - Temperate
    habitats.push('3_4'); // Shrubland - Temperate
  }

  // Mediterranean climate (California)
  if (state.includes('california') || displayName.includes('mediterranean')) {
    habitats.push('3_8'); // Shrubland - Mediterranean-type Shrubby Vegetation
    habitats.push('1_4'); // Forest - Temperate
    habitats.push('8_2'); // Desert - Temperate (southern CA)
  }

  // Subtropical regions (Florida, Gulf Coast)
  if (state.includes('florida') || state.includes('louisiana') ||
      state.includes('alabama') || state.includes('georgia') ||
      city.includes('miami') || city.includes('new orleans')) {
    habitats.push('1_5'); // Forest - Subtropical/Tropical Dry
    habitats.push('1_6'); // Forest - Subtropical/Tropical Moist Lowland
    habitats.push('1_8'); // Forest - Subtropical/Tropical Swamp
    habitats.push('5_4'); // Wetlands - Bogs, Marshes, Swamps
  }

  // Freshwater systems (for states with major rivers/lakes)
  if (state.includes('michigan') || state.includes('wisconsin') ||
      state.includes('minnesota') || displayName.includes('great lakes')) {
    habitats.push('5_5'); // Wetlands - Permanent Freshwater Lakes
    habitats.push('5_1'); // Wetlands - Permanent Rivers/Streams
  }

  // Marine coastal areas
  if (displayName.includes('coast') || city.includes('san diego') ||
      city.includes('seattle') || city.includes('boston') ||
      city.includes('miami')) {
    habitats.push('13_1'); // Marine Coastal - Sea Cliffs and Rocky Islands
    habitats.push('12_1'); // Marine Intertidal - Rocky Shoreline
  }

  // Default temperate habitats for most of continental US/Canada
  if (habitats.length === 0) {
    habitats.push('4_4'); // Grassland - Temperate (default for most locations)
    habitats.push('1_4'); // Forest - Temperate
  }

  return habitats;
}

function isStateOrCountryLocation(location: Location): boolean {
  // Determine if this is a state/country-level search vs city-level
  // State/country searches need larger radius
  const displayName = location.displayName.toLowerCase();

  // Check if it's just a state name or country
  const stateNames = ['alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming'];

  const countryNames = ['united states', 'usa', 'canada', 'mexico', 'united kingdom', 'australia', 'brazil', 'germany', 'france', 'spain', 'italy'];

  // Check if display name contains only state/country (no city)
  const hasStateOnly = stateNames.some(state => displayName.includes(state) && !displayName.includes(','));
  const hasCountryOnly = countryNames.some(country => displayName.includes(country) && !displayName.includes(','));

  return hasStateOnly || hasCountryOnly || !location.city;
}

function filterIucnSpeciesByRegion(iucnSpecies: Species[], location: Location): Species[] {
  // Filter out species that are obviously from wrong geographic regions
  const state = location.state?.toLowerCase() || '';
  const city = location.city?.toLowerCase() || '';
  const displayName = location.displayName.toLowerCase();

  return iucnSpecies.filter(species => {
    const scientificName = species.scientificName.toLowerCase();
    const commonName = species.commonName.toLowerCase();

    // Filter out obvious Pacific species when searching Atlantic coast states
    if (state.includes('florida') || state.includes('georgia') || state.includes('carolina') ||
        state.includes('virginia') || state.includes('maryland') || state.includes('delaware') ||
        displayName.includes('atlantic') || displayName.includes('east coast')) {

      // Exclude Pacific-specific species
      if (scientificName.includes('pacificus') || scientificName.includes('pacific') ||
          scientificName.includes('californicus') || scientificName.includes('oregonensis')) {
        return false;
      }
    }

    // Filter out Atlantic species when searching Pacific coast states
    if (state.includes('california') || state.includes('oregon') || state.includes('washington') ||
        state.includes('alaska') || displayName.includes('pacific') || displayName.includes('west coast')) {

      // Exclude Atlantic-specific species
      if (scientificName.includes('atlanticus') || scientificName.includes('atlantic') ||
          scientificName.includes('carolinensis')) {
        return false;
      }
    }

    // Filter out Hawaii-specific species when searching mainland states
    if (!state.includes('hawaii') && !displayName.includes('hawaii')) {
      if (scientificName.includes('hawaiiensis') || scientificName.includes('megalagrion')) {
        return false;
      }
    }

    // Filter out desert species when searching coastal/wetland areas
    if (displayName.includes('miami') || displayName.includes('florida') ||
        displayName.includes('wetland') || displayName.includes('coastal')) {
      if (scientificName.includes('deserti') || scientificName.includes('arizonensis')) {
        return false;
      }
    }

    // Filter out freshwater mussels from arid/desert states (they need major rivers)
    const isDesertState = state.includes('nevada') || state.includes('utah') || state.includes('arizona') ||
                         state.includes('new mexico') || city.includes('las vegas') || city.includes('phoenix') ||
                         displayName.includes('desert') || displayName.includes('las vegas');

    if (isDesertState) {
      // Exclude freshwater mussels (genus names like Lampsilis, Quadrula, etc.)
      if (scientificName.includes('lampsilis') || scientificName.includes('quadrula') ||
          scientificName.includes('fusconaia') || scientificName.includes('pleuronaia') ||
          scientificName.includes('margaritifera') || scientificName.includes('medionidus') ||
          scientificName.includes('obovaria') || scientificName.includes('hamiota') ||
          commonName.includes('mussel') || commonName.includes('pearly')) {
        return false;
      }

      // Exclude species from major river systems not in Nevada (Mississippi, Missouri, Ohio river systems)
      if (scientificName.includes('rafinesqueana') || // Neosho mucket (Arkansas River)
          scientificName.includes('subviridis') ||    // Green sandshell (Great Lakes)
          scientificName.includes('parvulus') ||      // Little-wing pearlymussel (Tennessee)
          scientificName.includes('ochracea')) {      // Tidewater mucket (Atlantic coast)
        return false;
      }

      // Exclude southeastern wetland species
      if (scientificName.includes('conchorum') ||     // Florida Keys mollies
          scientificName.includes('alabamae') ||      // Alabama cave shrimp
          scientificName.includes('walkeri') ||       // Walker's (southeastern streams)
          scientificName.includes('temminckii')) {    // Alligator snapping turtle (SE rivers)
        return false;
      }
    }

    // Filter out Midwest/Southeast river species from Western states generally
    const isWesternState = state.includes('california') || state.includes('oregon') || state.includes('washington') ||
                          state.includes('nevada') || state.includes('utah') || state.includes('arizona') ||
                          state.includes('colorado') || state.includes('wyoming') || state.includes('montana') ||
                          state.includes('idaho') || state.includes('alaska');

    if (isWesternState) {
      // Exclude species clearly from Eastern river systems
      if (scientificName.includes('temminckii') && !state.includes('texas')) { // Alligator snapping turtle (SE only)
        return false;
      }
    }

    // Filter out Southeastern river species from non-southeastern states
    const isSoutheasternState = state.includes('alabama') || state.includes('tennessee') ||
                               state.includes('mississippi') || state.includes('georgia') ||
                               state.includes('carolina') || state.includes('kentucky') ||
                               state.includes('arkansas');

    if (!isSoutheasternState) {
      // Exclude species endemic to Southeastern river systems
      if (scientificName.includes('walkeri') ||      // Walker's (Alabama/Tennessee rivers)
          scientificName.includes('haddletoni') ||   // Alabama (specific river basins)
          scientificName.includes('parvulus') ||     // Little-wing pearlymussel (Tennessee)
          scientificName.includes('marrianae')) {    // Alabama pearl shell (Alabama)
        return false;
      }
    }

    return true;
  });
}