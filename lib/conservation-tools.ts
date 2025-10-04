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
}

export async function geocodeLocation(locationQuery: string): Promise<Location | null> {
  try {
    console.log(`🗺️ GEOCODING STARTED for: "${locationQuery}"`);

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

    const url = `https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&limit=3&addressdetails=1&countrycodes=&accept-language=en`;

    console.log(`🌐 FETCHING from OpenStreetMap Nominatim:`, url);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ConservationAgent/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Geocoding failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      console.warn(`❌ GEOCODING FAILED: No results found for "${cleanQuery}"`);
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

    console.log(`✅ GEOCODING SUCCESS: "${cleanQuery}" → ${selectedResult.display_name}`);

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
    const locationName = location.city || location.state || location.country || 'this location';
    console.log(`Searching for wildlife in ${locationName} using real iNaturalist and GBIF APIs`);

    // Import the wildlife data service
    const { wildlifeDataService } = await import('./wildlife-data-service');

    // Get species data from both APIs
    const normalizedSpecies = await wildlifeDataService.getSpeciesForLocation(location, 12);

    // Convert normalized species to legacy Species format
    const species: Species[] = normalizedSpecies.map((ns, index) => ({
      id: ns.id,
      commonName: ns.commonName,
      scientificName: ns.scientificName,
      conservationStatus: ns.conservationStatus,
      description: `Found in ${locationName} with ${ns.observationCount} recent observation${ns.observationCount !== 1 ? 's' : ''}`,
      imageUrl: ns.imageUrl,
      habitat: ns.habitat || 'Local habitat',
      source: ns.source
    }));

    console.log(`Found ${species.length} endangered species from real API data for ${locationName}`);

    // Return species from APIs only (no fallback to AI search)
    return species.slice(0, 8);

  } catch (error) {
    console.error('Real API wildlife lookup error:', error);
    // Return empty array if APIs fail
    return [];
  }
}

function parseWildlifeSearchResults(searchResults: string, location: Location): Species[] {
  const species: Species[] = [];

  try {
    const lines = searchResults.split('\n');
    let currentSpecies: Partial<Species> = {};

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine) continue;

      // Check if line starts with a number (new species)
      const numberMatch = trimmedLine.match(/^(\d+)\.\s*(.+)/);
      if (numberMatch) {
        // Save previous species if it exists
        if (currentSpecies.commonName) {
          species.push({
            id: currentSpecies.id || `${currentSpecies.commonName}-${location.displayName}`,
            commonName: currentSpecies.commonName,
            scientificName: currentSpecies.scientificName || 'Unknown',
            conservationStatus: currentSpecies.conservationStatus || 'Data Deficient',
            habitat: currentSpecies.habitat || '',
            source: 'WebSearch'
          });
        }

        // Start new species - clean up common name to remove "Common Name" prefix
        let cleanCommonName = numberMatch[2].trim();
        // Remove "Common Name" prefix if it exists
        cleanCommonName = cleanCommonName.replace(/^Common Name\s*:?\s*/i, '');

        currentSpecies = {
          commonName: cleanCommonName,
          scientificName: '',
          conservationStatus: 'Data Deficient',
          habitat: '',
          id: ''
        };
        continue;
      }

      // Check for scientific name line
      const scientificMatch = trimmedLine.match(/^Scientific Name:\s*(.+)$/i);
      if (scientificMatch && currentSpecies.commonName) {
        currentSpecies.scientificName = scientificMatch[1].trim();
        continue;
      }

      // Check for conservation status line
      const statusMatch = trimmedLine.match(/^Conservation Status:\s*(.+)$/i);
      if (statusMatch && currentSpecies.commonName) {
        currentSpecies.conservationStatus = statusMatch[1].trim();
        continue;
      }

      // Check for type line
      const typeMatch = trimmedLine.match(/^Type:\s*(.+)$/i);
      if (typeMatch && currentSpecies.commonName) {
        currentSpecies.habitat = typeMatch[1].trim();
        continue;
      }
    }

    // Don't forget the last species
    if (currentSpecies.commonName) {
      species.push({
        id: currentSpecies.id || `${currentSpecies.commonName}-${location.displayName}`,
        commonName: currentSpecies.commonName,
        scientificName: currentSpecies.scientificName || 'Unknown',
        conservationStatus: currentSpecies.conservationStatus || 'Data Deficient',
        habitat: currentSpecies.habitat || '',
        source: 'WebSearch'
      });
    }

    console.log(`Parsed ${species.length} species from wildlife search results`);
    return species;

  } catch (error) {
    console.error('Error parsing wildlife search results:', error);
    return [];
  }
}

function removeDuplicateSpecies(species: Species[]): Species[] {
  const uniqueSpeciesMap = new Map<string, Species>();

  for (const sp of species) {
    const key = sp.commonName.toLowerCase();
    if (!uniqueSpeciesMap.has(key)) {
      uniqueSpeciesMap.set(key, sp);
    }
  }

  return Array.from(uniqueSpeciesMap.values());
}

// Enhanced multi-tier wildlife search system
async function enhancedWildlifeSearch(location: Location): Promise<Species[]> {
  const { openai } = await import('@ai-sdk/openai');
  const { generateText } = await import('ai');

  const locationName = location.city || location.state || location.country || 'this location';
  console.log(`Using enhanced wildlife search for ${locationName}`);

  // Tier 1: Web Search Simulation (primary approach)
  try {
    console.log(`Tier 1: Attempting web search simulation for ${locationName}`);

    const searchQueries = [
      `wildlife animals found in ${locationName} native species`,
      `birds mammals reptiles amphibians ${locationName} local wildlife`,
      `endangered species ${locationName} conservation status`
    ];

    let allSpecies: Species[] = [];

    for (const query of searchQueries) {
      try {
        const result = await generateText({
          model: openai('gpt-4o'),
          system: `You are a wildlife conservation expert with access to current IUCN Red List and biodiversity databases. Provide accurate information about ENDANGERED and THREATENED species only.`,
          prompt: `Search for ENDANGERED and THREATENED wildlife species in: "${query}"

Find 8-12 different ENDANGERED, VULNERABLE, or THREATENED wildlife species (mammals, birds, reptiles, amphibians) that are currently found in ${locationName}. For each species, provide:

Format:
1. Common Name
Scientific Name: [Scientific name]
Conservation Status: [Critically Endangered, Endangered, Vulnerable, or Near Threatened]
Type: [mammal/bird/reptile/amphibian]

2. Common Name
Scientific Name: [Scientific name]
Conservation Status: [Critically Endangered, Endangered, Vulnerable, or Near Threatened]
Type: [mammal/bird/reptile/amphibian]

CRITICAL REQUIREMENTS:
- ONLY include species with conservation status: Critically Endangered, Endangered, Vulnerable, or Near Threatened
- DO NOT include common species or species with "Data Deficient" or "Least Concern" status
- Species MUST actually be found in the geographic area of ${locationName}
- Include conservation status from IUCN Red List when available
- Diverse taxonomic groups (mammals, birds, reptiles, amphibians)
- Focus on species that have active conservation organizations

Provide real endangered/threatened species that exist in this location based on current conservation data.`
        });

        const speciesFromSearch = parseWildlifeSearchResults(result.text, location);
        allSpecies = [...allSpecies, ...speciesFromSearch];

      } catch (searchError) {
        console.log(`Web search query failed: ${searchError}`);
        continue;
      }
    }

    // Remove duplicates and limit results
    const uniqueSpecies = removeDuplicateSpecies(allSpecies);
    if (uniqueSpecies.length >= 3) {
      console.log(`Tier 1 web search simulation successful: ${uniqueSpecies.length} species found`);
      return uniqueSpecies.slice(0, 8);
    } else {
      console.log(`Tier 1 web search simulation insufficient results (${uniqueSpecies.length} species), trying Tier 2`);
    }
  } catch (error) {
    console.log('Tier 1 web search simulation failed, trying Tier 2');
  }

  // Tier 2: Ecosystem-based knowledge search
  try {
    const ecosystemResult = await generateText({
      model: openai('gpt-4o'),
      system: `You are a biogeography expert. Provide wildlife species data in valid JSON format only.`,
      prompt: `Identify wildlife species for location: ${locationName} (coordinates: ${location.lat}, ${location.lon})

First identify the main ecosystems/biomes present at this location, then find 8-10 diverse wildlife species from those ecosystems.

Respond with ONLY this JSON structure:
{
  "species": [
    {
      "commonName": "Species Name",
      "scientificName": "Genus species",
      "conservationStatus": "Status",
      "habitat": "Brief habitat description",
      "type": "mammal/bird/reptile/amphibian/fish/insect"
    }
  ]
}

Include diverse species (mammals, birds, reptiles, amphibians) actually found in this geographic region.`,
      temperature: 0.3
    });

    const parsed = JSON.parse(ecosystemResult.text);
    if (parsed.species && Array.isArray(parsed.species) && parsed.species.length > 0) {
      return parseEnhancedSpeciesData(parsed.species, location);
    }
  } catch (error) {
    console.log('Tier 2 ecosystem search failed, trying Tier 3');
  }

  // Tier 3: Biogeographic region search
  try {
    const regionResult = await generateText({
      model: openai('gpt-4o'),
      system: `You are a wildlife expert. Return valid JSON only.`,
      prompt: `Find wildlife species for ${locationName} using biogeographic region knowledge.

Respond with ONLY this JSON:
{
  "species": [
    {
      "commonName": "Species Name",
      "scientificName": "Genus species",
      "conservationStatus": "Least Concern/Near Threatened/Vulnerable/Endangered/Critically Endangered/Data Deficient",
      "habitat": "Where they live",
      "type": "mammal/bird/reptile/amphibian/fish"
    }
  ]
}

Find 8 species from different animal groups native to this region.`,
      temperature: 0.4
    });

    const parsed = JSON.parse(regionResult.text);
    if (parsed.species && Array.isArray(parsed.species) && parsed.species.length > 0) {
      return parseEnhancedSpeciesData(parsed.species, location);
    }
  } catch (error) {
    console.log('Tier 3 region search failed, trying Tier 4');
  }

  // Tier 4: Habitat-based search
  try {
    const country = location.country || 'this country';
    const habitatResult = await generateText({
      model: openai('gpt-4o'),
      system: `Wildlife database expert. JSON responses only.`,
      prompt: `Wildlife species found in various habitats near ${locationName}, ${country}.

JSON format only:
{
  "species": [
    {
      "commonName": "Common Name",
      "scientificName": "Scientific name",
      "conservationStatus": "Conservation status",
      "habitat": "Primary habitat",
      "type": "animal type"
    }
  ]
}

Include species from: urban areas, forests, wetlands, grasslands common to this region. Return 6-8 species.`,
      temperature: 0.5
    });

    const parsed = JSON.parse(habitatResult.text);
    if (parsed.species && Array.isArray(parsed.species) && parsed.species.length > 0) {
      return parseEnhancedSpeciesData(parsed.species, location);
    }
  } catch (error) {
    console.log('Tier 4 habitat search failed, using Tier 5');
  }

  // Tier 5: Broad geographic search (last resort)
  try {
    const country = location.country || 'North America';
    const broadResult = await generateText({
      model: openai('gpt-4o'),
      system: `Basic wildlife expert. Return JSON.`,
      prompt: `Common wildlife species in ${country}:

{
  "species": [
    {
      "commonName": "Name",
      "scientificName": "Scientific name",
      "conservationStatus": "Least Concern",
      "habitat": "General habitat",
      "type": "bird/mammal/reptile"
    }
  ]
}

6 common species only.`,
      temperature: 0.2
    });

    const parsed = JSON.parse(broadResult.text);
    if (parsed.species && Array.isArray(parsed.species)) {
      return parseEnhancedSpeciesData(parsed.species, location);
    }
  } catch (error) {
    console.error('All 5 wildlife search tiers failed:', error);
  }

  // Absolute fallback - return generic species
  return [{
    id: 'generic-1',
    commonName: 'Local Wildlife',
    scientificName: 'Contact local wildlife agencies',
    conservationStatus: 'Data Deficient',
    habitat: 'Various habitats',
    source: 'Generic'
  }];
}

function parseEnhancedSpeciesData(speciesData: any[], location: Location): Species[] {
  const species: Species[] = [];

  for (let i = 0; i < Math.min(speciesData.length, 8); i++) {
    const item = speciesData[i];
    if (item.commonName && item.scientificName) {
      species.push({
        id: `enhanced-${i}-${location.displayName}`,
        commonName: item.commonName.trim(),
        scientificName: item.scientificName.trim(),
        conservationStatus: item.conservationStatus?.trim() || 'Data Deficient',
        habitat: item.habitat?.trim() || '',
        source: 'Enhanced AI Search'
      });
    }
  }

  return species.length > 0 ? species : [{
    id: 'default-1',
    commonName: 'Local Wildlife',
    scientificName: 'Contact wildlife agencies',
    conservationStatus: 'Data Deficient',
    habitat: 'Local habitats',
    source: 'Default'
  }];
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
  try {
    console.log(`Finding conservation organizations for ${species.commonName} in ${location.displayName}`);

    // Use OpenAI WebSearch tool to find real organizations (no hardcoded orgs)
    const webSearchOrgs = await searchConservationOrganizations(species, location);

    console.log(`Found ${webSearchOrgs.length} organizations for ${species.commonName} via WebSearch`);
    return webSearchOrgs.slice(0, 6); // Return top 6 organizations

  } catch (error) {
    console.error('Organization search error:', error);
    return [];
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

    console.log(`🔍 WEBSEARCH STARTING for ${species.commonName} (${speciesGroup}) organizations in ${locationName}`);

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
          console.log(`🌐 WEBSEARCH QUERY: "${query}"`);

          // Use AI with web search knowledge to find organizations
          const { openai } = await import('@ai-sdk/openai');
          const { generateText } = await import('ai');

          // Use OpenAI's WebSearch-enabled model for conservation organizations
          const { OpenAI } = await import('openai');
          const openaiClient = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
          });

          const searchResult = await openaiClient.chat.completions.create({
            model: 'gpt-4o-search-preview',
            web_search_options: {},
            messages: [
              {
                role: 'system',
                content: 'You are a conservation organization researcher. Search the web for current, legitimate conservation organizations.'
              },
              {
                role: 'user',
                content: `Find conservation organizations for: "${query}"

Search for current, legitimate organizations that work with ${species.commonName} or ${speciesGroup} in ${locationName}.

Format results as:

1. Organization Name
Website: URL (actual working website)
Description: Brief description of their conservation work
Location: Geographic area they serve

Focus on:
- Local wildlife rehabilitation centers in ${locationName}
- Regional conservation groups in ${location.state || location.country}
- Species-specific organizations for ${species.commonName}
- State wildlife agencies and departments
- Established national organizations with local programs

Search the web for real organizations with actual websites that are currently active. Return 3-5 organizations.`
              }
            ]
          });

          const searchResultText = searchResult.choices[0]?.message?.content || '';
          const mockSearchResult = { text: searchResultText };

          console.log(`✅ WEBSEARCH SUCCESS for "${query}": ${mockSearchResult.text.length} characters found`);

          if (mockSearchResult && mockSearchResult.text && mockSearchResult.text.length > 0) {
            // Parse the search results to extract organizations
            const orgsFromSearch = extractOrganizationsFromText(mockSearchResult.text, location);
            webSearchResults = [...webSearchResults, ...orgsFromSearch];
          }
        } catch (searchError) {
          console.log(`❌ WEBSEARCH FAILED for "${query}": ${searchError}`);
          continue;
        }
      }
    } catch (webSearchError) {
      console.log(`❌ WEBSEARCH UNAVAILABLE: ${webSearchError}`);
    }

    // No LLM knowledge base fallback - only return WebSearch results

    console.log(`🏢 WEBSEARCH COMPLETE: ${webSearchResults.length} total organizations found, returning top 4`);
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
            website: currentOrg.website || ''
          });
        }

        // Start new org
        currentOrg = {
          name: orgNameMatch[1].trim(),
          website: ''
        };
        continue;
      }

      // Look for website URLs
      const urlMatch = trimmedLine.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch && currentOrg.name && !currentOrg.website) {
        currentOrg.website = urlMatch[1];
        continue;
      }

    }

    // Don't forget the last organization
    if (currentOrg.name) {
      organizations.push({
        name: currentOrg.name,
        website: currentOrg.website || ''
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
          website: currentOrg.website || ''
        });
      }

      // Start new org
      currentOrg = {
        name: numberMatch[2].trim(),
        website: ''
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

    // If we have an org name and this line contains a URL, treat it as website
    if (currentOrg.name && !currentOrg.website && trimmedLine.match(/https?:\/\/[^\s]+/)) {
      const urlMatch = trimmedLine.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch) {
        currentOrg.website = urlMatch[1];
      }
      continue;
    }
  }

  // Don't forget the last organization
  if (currentOrg.name) {
    organizations.push({
      name: currentOrg.name,
      website: currentOrg.website || ''
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

// Removed hardcoded organizations - now using WebSearch only

// Removed hardcoded general organizations - using WebSearch only

async function getGovernmentConservationOrgs(location: Location): Promise<Organization[]> {
  try {
    // Check for OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY environment variable is not set');
      return [];
    }

    const locationName = location.city || location.state || location.country || 'this location';
    console.log(`Searching for government wildlife agencies in ${locationName}`);

    // Use OpenAI WebSearch to find real, current government agencies
    const { OpenAI } = await import('openai');
    const openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const searchResult = await openaiClient.chat.completions.create({
      model: 'gpt-4o-search-preview',
      web_search_options: {},
      messages: [
        {
          role: 'system',
          content: 'You are an expert on government wildlife agencies. Search the web for current, official government organizations responsible for wildlife conservation.'
        },
        {
          role: 'user',
          content: `Search for official government wildlife and environmental agencies in ${locationName}.

Find agencies that:
- Manage wildlife conservation and protection
- Oversee national/state parks and wildlife refuges
- Issue wildlife licenses and permits
- Enforce wildlife protection laws
- Protect endangered species

For each agency, provide:

1. Agency Name
Website: [Official .gov or official government website URL]
Description: [Brief description of their wildlife/conservation role]
Location: [Geographic scope - state/province/country]

2. Agency Name
Website: [Official .gov or official government website URL]
Description: [Brief description of their wildlife/conservation role]
Location: [Geographic scope - state/province/country]

Focus on official government agencies only (not NGOs). Verify they have official websites.`
        }
      ]
    });

    const resultText = searchResult.choices[0]?.message?.content || '';
    console.log(`Government agency search result:`, resultText);

    // Parse the search results to extract organizations
    const govOrgs = extractOrganizationsFromText(resultText, location);
    return govOrgs.slice(0, 3); // Return top 3 government agencies

  } catch (error) {
    console.error('Government agency search failed:', error);
    // Fallback: return hardcoded agencies based on country
    return getHardcodedGovernmentAgencies(location);
  }
}

function getHardcodedGovernmentAgencies(location: Location): Organization[] {
  const country = location.country?.toLowerCase() || location.displayName.toLowerCase();

  // Singapore
  if (country.includes('singapore')) {
    return [
      {
        name: 'National Parks Board (NParks)',
        website: 'https://www.nparks.gov.sg'
      },
      {
        name: 'Wildlife Reserves Singapore',
        website: 'https://www.wrs.com.sg'
      },
      {
        name: 'Nature Society (Singapore)',
        website: 'https://www.nss.org.sg'
      }
    ];
  }

  // United States
  if (country.includes('united states') || country.includes('usa') || country.includes('america')) {
    const stateName = location.state || 'your state';
    return [
      {
        name: `${stateName} Department of Fish and Wildlife`,
        website: '#'
      },
      {
        name: 'U.S. Fish and Wildlife Service',
        website: 'https://www.fws.gov'
      },
      {
        name: 'National Wildlife Federation',
        website: 'https://www.nwf.org'
      }
    ];
  }

  // Canada
  if (country.includes('canada')) {
    return [
      {
        name: 'Environment and Climate Change Canada',
        website: 'https://www.canada.ca/en/environment-climate-change.html'
      },
      {
        name: 'Canadian Wildlife Federation',
        website: 'https://cwf-fcf.org'
      }
    ];
  }

  // United Kingdom
  if (country.includes('united kingdom') || country.includes('england') || country.includes('scotland') || country.includes('wales')) {
    return [
      {
        name: 'Natural England',
        website: 'https://www.gov.uk/government/organisations/natural-england'
      },
      {
        name: 'The Wildlife Trusts',
        website: 'https://www.wildlifetrusts.org'
      }
    ];
  }

  // Australia
  if (country.includes('australia')) {
    return [
      {
        name: 'Department of Climate Change, Energy, the Environment and Water',
        website: 'https://www.dcceew.gov.au'
      },
      {
        name: 'Australian Wildlife Conservancy',
        website: 'https://www.australianwildlife.org'
      }
    ];
  }

  // Generic fallback
  return [
    {
      name: 'Local Wildlife Conservation Authority',
      website: '#'
    }
  ];
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

// ==================== WIKIPEDIA SEARCH TOOLS ====================

export interface WikipediaSearchResult {
  title: string;
  snippet: string;
  pageid: number;
}

export interface WikipediaSummary {
  title: string;
  extract: string;
  thumbnail?: {
    source: string;
    width: number;
    height: number;
  };
  originalimage?: {
    source: string;
    width: number;
    height: number;
  };
  pageUrl: string;
}

export interface WikipediaKeyFact {
  fact: string;
  category: string;
}

/**
 * Search Wikipedia for articles matching a query
 * @param query - Search query string
 * @param limit - Maximum number of results to return (default: 5)
 * @returns Array of search results with titles and snippets
 */
export async function searchWikipedia(query: string, limit: number = 5): Promise<WikipediaSearchResult[]> {
  try {
    console.log(`🔍 WIKIPEDIA SEARCH: "${query}"`);

    const response = await fetch(
      `https://en.wikipedia.org/w/api.php?` +
      `action=query&` +
      `list=search&` +
      `srsearch=${encodeURIComponent(query)}&` +
      `srlimit=${limit}&` +
      `format=json&` +
      `origin=*`,
      {
        headers: {
          'User-Agent': 'Wildlife-Finder/1.0 (Educational Conservation Tool)',
        },
      }
    );

    const data = await response.json();
    const results: WikipediaSearchResult[] = data.query?.search || [];

    console.log(`✅ WIKIPEDIA SEARCH: Found ${results.length} results for "${query}"`);
    return results;

  } catch (error) {
    console.error('❌ WIKIPEDIA SEARCH ERROR:', error);
    return [];
  }
}

/**
 * Get a concise summary of a Wikipedia article
 * @param title - Article title or search query
 * @returns Summary with extract, images, and page URL
 */
export async function getWikipediaSummary(title: string): Promise<WikipediaSummary | null> {
  try {
    console.log(`📖 WIKIPEDIA SUMMARY: Fetching "${title}"`);

    const response = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      {
        headers: {
          'User-Agent': 'Wildlife-Finder/1.0 (Educational Conservation Tool)',
        },
      }
    );

    if (!response.ok) {
      console.error(`❌ WIKIPEDIA SUMMARY: Article "${title}" not found (${response.status})`);
      return null;
    }

    const data = await response.json();

    const summary: WikipediaSummary = {
      title: data.title,
      extract: data.extract || '',
      thumbnail: data.thumbnail,
      originalimage: data.originalimage,
      pageUrl: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`
    };

    console.log(`✅ WIKIPEDIA SUMMARY: Retrieved summary for "${summary.title}"`);
    return summary;

  } catch (error) {
    console.error('❌ WIKIPEDIA SUMMARY ERROR:', error);
    return null;
  }
}

/**
 * Get full article content from Wikipedia
 * @param title - Article title
 * @returns Full article HTML content
 */
export async function getWikipediaArticle(title: string): Promise<string | null> {
  try {
    console.log(`📰 WIKIPEDIA ARTICLE: Fetching "${title}"`);

    const response = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title)}`,
      {
        headers: {
          'User-Agent': 'Wildlife-Finder/1.0 (Educational Conservation Tool)',
        },
      }
    );

    if (!response.ok) {
      console.error(`❌ WIKIPEDIA ARTICLE: Article "${title}" not found (${response.status})`);
      return null;
    }

    const html = await response.text();
    console.log(`✅ WIKIPEDIA ARTICLE: Retrieved article "${title}" (${html.length} chars)`);
    return html;

  } catch (error) {
    console.error('❌ WIKIPEDIA ARTICLE ERROR:', error);
    return null;
  }
}

/**
 * Extract key facts from a Wikipedia summary using AI
 * @param title - Article title to extract facts from
 * @returns Array of key facts with categories
 */
export async function extractWikipediaKeyFacts(title: string): Promise<WikipediaKeyFact[]> {
  try {
    console.log(`🔑 WIKIPEDIA KEY FACTS: Extracting from "${title}"`);

    // First get the summary
    const summary = await getWikipediaSummary(title);
    if (!summary) {
      return [];
    }

    // Check for OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY environment variable is not set');
      return [];
    }

    // Use OpenAI to extract key facts
    const { OpenAI } = await import('openai');
    const openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You extract key facts from Wikipedia articles about wildlife and conservation topics. Format each fact as: CATEGORY: Fact text'
        },
        {
          role: 'user',
          content: `Extract 5-7 key facts from this Wikipedia summary about "${title}":\n\n${summary.extract}\n\nFormat each as: CATEGORY: Fact\nCategories can be: Habitat, Diet, Conservation Status, Physical Characteristics, Behavior, Range, Population, etc.`
        }
      ],
      temperature: 0.3,
    });

    const resultText = completion.choices[0]?.message?.content || '';

    // Parse the facts
    const facts: WikipediaKeyFact[] = [];
    const lines = resultText.split('\n').filter(line => line.trim());

    for (const line of lines) {
      const match = line.match(/^([^:]+):\s*(.+)$/);
      if (match) {
        facts.push({
          category: match[1].trim(),
          fact: match[2].trim()
        });
      }
    }

    console.log(`✅ WIKIPEDIA KEY FACTS: Extracted ${facts.length} facts from "${title}"`);
    return facts;

  } catch (error) {
    console.error('❌ WIKIPEDIA KEY FACTS ERROR:', error);
    return [];
  }
}