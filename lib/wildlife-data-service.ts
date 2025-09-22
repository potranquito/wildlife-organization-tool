import { Location, Species } from './conservation-tools';

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
   * Get species list for a location using both APIs
   */
  async getSpeciesForLocation(location: Location, limit: number = 20): Promise<NormalizedSpecies[]> {
    const results = await Promise.allSettled([
      this.getInatSpeciesForLocation(location, limit),
      this.getGbifSpeciesForLocation(location, limit)
    ]);

    const inatSpecies = results[0].status === 'fulfilled' ? results[0].value : [];
    const gbifSpecies = results[1].status === 'fulfilled' ? results[1].value : [];

    // Merge and deduplicate species
    const combined = this.mergeSpeciesLists(inatSpecies, gbifSpecies);

    // Sort by observation count (descending) and take top results
    return combined
      .sort((a, b) => b.observationCount - a.observationCount)
      .slice(0, limit);
  }

  /**
   * Get species data from iNaturalist
   */
  private async getInatSpeciesForLocation(location: Location, limit: number): Promise<NormalizedSpecies[]> {
    try {
      // Get species counts for the location
      const params = new URLSearchParams({
        lat: location.lat.toString(),
        lng: location.lon.toString(),
        radius: '50',
        per_page: limit.toString(),
        iconic_taxa: 'Mammalia,Aves,Reptilia,Amphibia'
      });

      // Use relative URL to avoid port issues
      const response = await fetch(`/api/inat/species-counts?${params.toString()}`);

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
   */
  private async getGbifSpeciesForLocation(location: Location, limit: number): Promise<NormalizedSpecies[]> {
    try {
      // GBIF doesn't have a direct "species in area" endpoint like iNat
      // We'll need to search for common taxa and get their occurrences
      const commonTaxa = [
        'Mammalia', 'Aves', 'Reptilia', 'Amphibia'
      ];

      const allSpecies: NormalizedSpecies[] = [];

      for (const taxon of commonTaxa) {
        try {
          // Search for species in this taxonomic group
          const searchParams = new URLSearchParams({
            q: taxon,
            rank: 'SPECIES',
            limit: Math.ceil(limit / commonTaxa.length).toString()
          });

          // Use relative URL to avoid port issues
          const searchResponse = await fetch(`/api/gbif/search?${searchParams.toString()}`);

          if (searchResponse.ok) {
            const searchData = await searchResponse.json();

            if (searchData.results && Array.isArray(searchData.results)) {
              for (const species of searchData.results) {
                // Check if this species has occurrences in the area
                const occParams = new URLSearchParams({
                  taxonKey: species.key.toString(),
                  lat: location.lat.toString(),
                  lng: location.lon.toString(),
                  radius: '50',
                  limit: '5'
                });

                const occResponse = await fetch(`/api/gbif/occurrences?${occParams.toString()}`);

                if (occResponse.ok) {
                  const occData = await occResponse.json();

                  if (occData.results && occData.results.length > 0) {
                    const normalizedSpecies: NormalizedSpecies = {
                      id: `gbif-${species.key}`,
                      commonName: species.vernacularNames?.[0]?.vernacularName || species.species || 'Unknown',
                      scientificName: species.scientificName || species.species || '',
                      conservationStatus: 'Data Deficient', // GBIF doesn't always have conservation status
                      observationCount: occData.count || occData.results.length,
                      recentObservations: [],
                      source: 'GBIF',
                      taxonRank: species.rank
                    };

                    allSpecies.push(normalizedSpecies);
                  }
                }
              }
            }
          }
        } catch (taxonError) {
          console.warn(`Error searching GBIF for ${taxon}:`, taxonError);
        }
      }

      return allSpecies.slice(0, limit);
    } catch (error) {
      console.error('Error fetching GBIF species:', error);
      return [];
    }
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
      const response = await fetch(`/api/inat/observations?${params.toString()}`);

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
      const response = await fetch(`/api/gbif/occurrences?${params.toString()}`);

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