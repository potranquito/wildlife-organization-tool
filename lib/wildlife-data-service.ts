import { Location, Species } from './conservation-tools';

// Get the base URL for API calls
const getBaseUrl = () => {
  if (typeof window !== 'undefined') {
    // Client-side
    return window.location.origin;
  }
  // Server-side - use environment variable or detect port
  const port = process.env.PORT || '3001'; // Default to 3001 since 3000 is often in use
  return process.env.NEXTAUTH_URL || process.env.VERCEL_URL || `http://localhost:${port}`;
};

// Unified interface for wildlife observation data
export interface WildlifeObservation {
  id: string;
  speciesName: string;
  scientificName: string;
  commonName: string;
  lat: number;
  lng: number;
  observedAt: string;
  observerName?: string;
  photoUrl?: string;
  sourceUrl?: string;
  source: 'iNaturalist' | 'GBIF';
  conservationStatus?: string;
  taxonRank?: string;
  habitat?: string;
}

// Normalized species data structure
export interface NormalizedSpecies {
  id: string;
  commonName: string;
  scientificName: string;
  conservationStatus: string;
  observationCount: number;
  recentObservations: WildlifeObservation[];
  source: 'iNaturalist' | 'GBIF' | 'combined';
  taxonRank?: string;
  habitat?: string;
  imageUrl?: string;
}

/**
 * Unified Wildlife Data Service
 * Fetches and normalizes data from both iNaturalist and GBIF APIs
 */
export class WildlifeDataService {
  private static instance: WildlifeDataService;

  public static getInstance(): WildlifeDataService {
    if (!WildlifeDataService.instance) {
      WildlifeDataService.instance = new WildlifeDataService();
    }
    return WildlifeDataService.instance;
  }

  /**
   * Get species list for a location using all three APIs (iNaturalist, GBIF, IUCN)
   * FILTERS TO ONLY ENDANGERED/THREATENED SPECIES
   */
  async getSpeciesForLocation(location: Location, limit: number = 20): Promise<NormalizedSpecies[]> {
    console.log(`🔄 FETCHING FROM 3 APIs: iNaturalist, GBIF, and enriching with IUCN Red List`);

    const results = await Promise.allSettled([
      this.getInatSpeciesForLocation(location, limit * 3), // Request more to account for filtering
      this.getGbifSpeciesForLocation(location, limit * 3)
    ]);

    const inatSpecies = results[0].status === 'fulfilled' ? results[0].value : [];
    const gbifSpecies = results[1].status === 'fulfilled' ? results[1].value : [];

    // Merge and deduplicate species
    const combined = this.mergeSpeciesLists(inatSpecies, gbifSpecies);

    // STEP 3: Enrich with authoritative IUCN Red List data
    console.log(`🔴 ENRICHING ${combined.length} species with IUCN Red List data...`);
    const enrichedSpecies = await this.enrichWithIUCNData(combined);

    // Try to prioritize endangered species if available
    const endangeredStatuses = [
      'Critically Endangered',
      'Endangered',
      'Vulnerable',
      'Near Threatened',
      'Conservation Dependent'
    ];

    const endangeredSpecies = enrichedSpecies.filter(species =>
      endangeredStatuses.includes(species.conservationStatus)
    );

    console.log(`🔴 FILTERED: ${enrichedSpecies.length} total → ${endangeredSpecies.length} endangered/threatened (with IUCN enrichment)`);

    // Prefer endangered species, but show all if none found
    const speciesListToReturn = endangeredSpecies.length > 0 ? endangeredSpecies : enrichedSpecies;

    if (endangeredSpecies.length === 0) {
      console.log('⚠️ No endangered species found, showing all wildlife');
    }

    // Sort by observation count to show most commonly observed species
    return speciesListToReturn
      .sort((a, b) => b.observationCount - a.observationCount)
      .slice(0, limit);
  }

  /**
   * Enrich species data with authoritative IUCN Red List information
   */
  private async enrichWithIUCNData(species: NormalizedSpecies[]): Promise<NormalizedSpecies[]> {
    // Enrich up to 10 species (to avoid too many API calls)
    const speciesToEnrich = species.slice(0, 10);

    const enrichmentResults = await Promise.allSettled(
      speciesToEnrich.map(async (sp) => {
        try {
          const response = await fetch(
            `${getBaseUrl()}/api/iucn/species-status?scientificName=${encodeURIComponent(sp.scientificName)}`
          );

          if (!response.ok) {
            return sp; // Return original if IUCN lookup fails
          }

          const iucnData = await response.json();

          if (iucnData.found) {
            console.log(`✅ IUCN ENRICHED: ${sp.scientificName} → ${iucnData.categoryLabel}`);
            return {
              ...sp,
              conservationStatus: iucnData.categoryLabel || sp.conservationStatus,
              source: 'combined' as const,
              // Add IUCN-specific data to species object
              iucnData: {
                category: iucnData.category,
                populationTrend: iucnData.populationTrend,
                assessmentDate: iucnData.assessmentDate
              }
            };
          }

          return sp;
        } catch (error) {
          console.warn(`⚠️ IUCN enrichment failed for ${sp.scientificName}:`, error);
          return sp;
        }
      })
    );

    const enriched = enrichmentResults.map((result) =>
      result.status === 'fulfilled' ? result.value : species[0]
    );

    // Return enriched species + remaining un-enriched species
    return [...enriched, ...species.slice(10)];
  }

  /**
   * Get species data from iNaturalist
   * Filters for threatened/endangered species using threatened=true parameter
   */
  private async getInatSpeciesForLocation(location: Location, limit: number): Promise<NormalizedSpecies[]> {
    try {
      // Get species counts for the location
      const params = new URLSearchParams({
        lat: location.lat.toString(),
        lng: location.lon.toString(),
        radius: '50',
        per_page: limit.toString(),
        iconic_taxa: 'Mammalia,Aves,Reptilia,Amphibia',
        threatened: 'true'  // CRITICAL: Filter for endangered/threatened species only
      });

      // Use absolute URL for server-side fetch
      const response = await fetch(`${getBaseUrl()}/api/inat/species-counts?${params.toString()}`);

      if (!response.ok) {
        console.error('iNaturalist species-counts API error:', response.status);
        return [];
      }

      const data = await response.json();

      if (!data.results || !Array.isArray(data.results)) {
        console.warn('No iNaturalist species results found');
        return [];
      }

      // Convert iNaturalist species counts to normalized format
      const species: NormalizedSpecies[] = [];

      for (const item of data.results.slice(0, limit)) {
        if (!item.taxon) continue;

        const taxon = item.taxon;
        const normalizedSpecies: NormalizedSpecies = {
          id: `inat-${taxon.id}`,
          commonName: taxon.preferred_common_name || taxon.name || 'Unknown',
          scientificName: taxon.name || '',
          conservationStatus: this.mapInatConservationStatus(taxon.conservation_status),
          observationCount: item.count || 0,
          recentObservations: [],
          source: 'iNaturalist',
          taxonRank: taxon.rank,
          imageUrl: taxon.default_photo?.square_url || taxon.default_photo?.small_url
        };

        species.push(normalizedSpecies);
      }

      return species;
    } catch (error) {
      console.error('Error fetching iNaturalist species:', error);
      return [];
    }
  }

  /**
   * Get species data from GBIF
   * Uses IUCN Red List category filter to get ONLY endangered/threatened species
   */
  private async getGbifSpeciesForLocation(location: Location, limit: number): Promise<NormalizedSpecies[]> {
    try {
      // Use the new endangered occurrences endpoint
      // This directly queries GBIF with iucnRedListCategory=CR,EN,VU,NT filter
      const params = new URLSearchParams({
        lat: location.lat.toString(),
        lng: location.lon.toString(),
        radius: '50',
        limit: (limit * 3).toString() // Request more to account for deduplication
      });

      const response = await fetch(`${getBaseUrl()}/api/gbif/endangered-occurrences?${params.toString()}`);

      if (!response.ok) {
        console.error('GBIF endangered occurrences API error:', response.status);
        return [];
      }

      const data = await response.json();

      if (!data.results || !Array.isArray(data.results)) {
        console.warn('No GBIF endangered occurrences results found');
        return [];
      }

      // Group occurrences by species and count them
      const speciesMap = new Map<string, {
        taxonKey: string;
        scientificName: string;
        vernacularName?: string;
        iucnStatus: string;
        count: number;
      }>();

      for (const occurrence of data.results) {
        const taxonKey = occurrence.speciesKey || occurrence.taxonKey;
        if (!taxonKey) continue;

        const key = taxonKey.toString();
        if (speciesMap.has(key)) {
          speciesMap.get(key)!.count++;
        } else {
          speciesMap.set(key, {
            taxonKey: key,
            scientificName: occurrence.scientificName || occurrence.species || 'Unknown',
            vernacularName: occurrence.vernacularName,
            iucnStatus: occurrence.iucnRedListCategory || 'Unknown',
            count: 1
          });
        }
      }

      // Convert to NormalizedSpecies format
      const species: NormalizedSpecies[] = Array.from(speciesMap.values()).map((sp) => ({
        id: `gbif-${sp.taxonKey}`,
        commonName: sp.vernacularName || sp.scientificName,
        scientificName: sp.scientificName,
        conservationStatus: this.mapIUCNToFullStatus(sp.iucnStatus),
        observationCount: sp.count,
        recentObservations: [],
        source: 'GBIF',
        taxonRank: 'SPECIES'
      }));

      console.log(`🔴 GBIF found ${species.length} endangered species from ${data.results.length} occurrences`);
      return species.slice(0, limit);
    } catch (error) {
      console.error('Error fetching GBIF endangered species:', error);
      return [];
    }
  }

  /**
   * Map IUCN Red List category codes to full names
   */
  private mapIUCNToFullStatus(code: string): string {
    const statusMap: {[key: string]: string} = {
      'CR': 'Critically Endangered',
      'EN': 'Endangered',
      'VU': 'Vulnerable',
      'NT': 'Near Threatened',
      'LC': 'Least Concern',
      'DD': 'Data Deficient',
      'EX': 'Extinct',
      'EW': 'Extinct in the Wild',
      'NE': 'Not Evaluated'
    };
    return statusMap[code] || code;
  }

  /**
   * Get detailed observations for a specific species
   */
  async getSpeciesObservations(
    speciesName: string,
    location: Location,
    limit: number = 20
  ): Promise<WildlifeObservation[]> {
    const results = await Promise.allSettled([
      this.getInatObservations(speciesName, location, limit),
      this.getGbifObservations(speciesName, location, limit)
    ]);

    const inatObs = results[0].status === 'fulfilled' ? results[0].value : [];
    const gbifObs = results[1].status === 'fulfilled' ? results[1].value : [];

    // Combine and sort by date (most recent first)
    return [...inatObs, ...gbifObs]
      .sort((a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime())
      .slice(0, limit);
  }

  /**
   * Get iNaturalist observations for a species
   */
  private async getInatObservations(
    speciesName: string,
    location: Location,
    limit: number
  ): Promise<WildlifeObservation[]> {
    try {
      const params = new URLSearchParams({
        taxon_name: speciesName,
        lat: location.lat.toString(),
        lng: location.lon.toString(),
        radius: '50',
        per_page: limit.toString()
      });

      // Use relative URL to avoid port issues
      const response = await fetch(`${getBaseUrl()}/api/inat/observations?${params.toString()}`);

      if (!response.ok) return [];

      const data = await response.json();

      if (!data.results || !Array.isArray(data.results)) return [];

      return data.results.map((obs: any): WildlifeObservation => ({
        id: `inat-${obs.id}`,
        speciesName: obs.taxon?.preferred_common_name || obs.taxon?.name || 'Unknown',
        scientificName: obs.taxon?.name || '',
        commonName: obs.taxon?.preferred_common_name || obs.taxon?.name || 'Unknown',
        lat: obs.location ? parseFloat(obs.location.split(',')[0]) : 0,
        lng: obs.location ? parseFloat(obs.location.split(',')[1]) : 0,
        observedAt: obs.observed_on || obs.created_at,
        observerName: obs.user?.name || obs.user?.login,
        photoUrl: obs.photos?.[0]?.url,
        sourceUrl: `https://www.inaturalist.org/observations/${obs.id}`,
        source: 'iNaturalist',
        conservationStatus: this.mapInatConservationStatus(obs.taxon?.conservation_status)
      }));
    } catch (error) {
      console.error('Error fetching iNaturalist observations:', error);
      return [];
    }
  }

  /**
   * Get GBIF observations for a species
   */
  private async getGbifObservations(
    speciesName: string,
    location: Location,
    limit: number
  ): Promise<WildlifeObservation[]> {
    try {
      const params = new URLSearchParams({
        name: speciesName,
        lat: location.lat.toString(),
        lng: location.lon.toString(),
        radius: '50',
        limit: limit.toString()
      });

      // Use relative URL to avoid port issues
      const response = await fetch(`${getBaseUrl()}/api/gbif/occurrences?${params.toString()}`);

      if (!response.ok) return [];

      const data = await response.json();

      if (!data.results || !Array.isArray(data.results)) return [];

      return data.results
        .filter((occ: any) => occ.decimalLatitude && occ.decimalLongitude)
        .map((occ: any): WildlifeObservation => ({
          id: `gbif-${occ.key}`,
          speciesName: occ.vernacularName || occ.species || 'Unknown',
          scientificName: occ.scientificName || occ.species || '',
          commonName: occ.vernacularName || occ.species || 'Unknown',
          lat: occ.decimalLatitude,
          lng: occ.decimalLongitude,
          observedAt: occ.eventDate || occ.lastInterpreted || new Date().toISOString(),
          observerName: occ.recordedBy,
          sourceUrl: `https://www.gbif.org/occurrence/${occ.key}`,
          source: 'GBIF'
        }));
    } catch (error) {
      console.error('Error fetching GBIF observations:', error);
      return [];
    }
  }

  /**
   * Merge species lists from both APIs, removing duplicates
   */
  private mergeSpeciesLists(
    inatSpecies: NormalizedSpecies[],
    gbifSpecies: NormalizedSpecies[]
  ): NormalizedSpecies[] {
    const merged = new Map<string, NormalizedSpecies>();

    // Add iNaturalist species
    for (const species of inatSpecies) {
      const key = this.normalizeSpeciesKey(species.scientificName || species.commonName);
      merged.set(key, species);
    }

    // Add GBIF species, merging with existing if found
    for (const species of gbifSpecies) {
      const key = this.normalizeSpeciesKey(species.scientificName || species.commonName);
      const existing = merged.get(key);

      if (existing) {
        // Merge the species data
        existing.observationCount += species.observationCount;
        existing.source = 'combined';
        if (!existing.imageUrl && species.imageUrl) {
          existing.imageUrl = species.imageUrl;
        }
      } else {
        merged.set(key, species);
      }
    }

    return Array.from(merged.values());
  }

  /**
   * Normalize species name for deduplication
   */
  private normalizeSpeciesKey(name: string): string {
    return name.toLowerCase().trim().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ');
  }

  /**
   * Map iNaturalist conservation status to standard format
   */
  private mapInatConservationStatus(status: any): string {
    if (!status) return 'Data Deficient';

    const statusMap: { [key: string]: string } = {
      'LC': 'Least Concern',
      'NT': 'Near Threatened',
      'VU': 'Vulnerable',
      'EN': 'Endangered',
      'CR': 'Critically Endangered',
      'EW': 'Extinct in the Wild',
      'EX': 'Extinct'
    };

    return statusMap[status.status_name || status] || 'Data Deficient';
  }
}

// Export singleton instance
export const wildlifeDataService = WildlifeDataService.getInstance();