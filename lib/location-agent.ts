import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { geocodeLocation, type Location } from './conservation-tools';

// Enhanced location parsing result
export interface LocationParsingResult {
  success: boolean;
  location?: Location;
  needsDisambiguation?: boolean;
  disambiguationOptions?: DisambiguationOption[];
  errorMessage?: string;
  formattedLocationQuery?: string;
}

export interface DisambiguationOption {
  displayName: string;
  searchQuery: string;
  description: string;
  country: string;
  region?: string;
}

// Location validation and parsing service
export class LocationAgent {
  private static instance: LocationAgent;

  public static getInstance(): LocationAgent {
    if (!LocationAgent.instance) {
      LocationAgent.instance = new LocationAgent();
    }
    return LocationAgent.instance;
  }

  /**
   * Main entry point for location parsing with comprehensive handling
   */
  async parseLocation(userInput: string): Promise<LocationParsingResult> {
    try {
      const cleanInput = this.sanitizeInput(userInput);

      // Step 1: Basic validation
      const validation = this.validateLocationInput(cleanInput);
      if (!validation.isValid) {
        return {
          success: false,
          errorMessage: validation.errorMessage
        };
      }

      // Step 2: Extract and normalize location
      const extractedLocation = this.extractLocationFromInput(cleanInput);
      if (!extractedLocation) {
        return {
          success: false,
          errorMessage: 'Could not identify a location in your input. Please try again with a city, state, or country name.'
        };
      }

      // Step 3: Check for ambiguous locations that need disambiguation
      const ambiguityCheck = await this.checkForAmbiguousLocation(extractedLocation);
      if (ambiguityCheck.needsDisambiguation) {
        return {
          success: false,
          needsDisambiguation: true,
          disambiguationOptions: ambiguityCheck.options,
          formattedLocationQuery: extractedLocation
        };
      }

      // Step 4: Geocode the location
      const location = await geocodeLocation(extractedLocation);
      if (!location) {
        // Try alternative formats if geocoding fails
        const alternatives = this.generateAlternativeQueries(extractedLocation);
        for (const alt of alternatives) {
          const altLocation = await geocodeLocation(alt);
          if (altLocation) {
            return {
              success: true,
              location: altLocation,
              formattedLocationQuery: alt
            };
          }
        }

        return {
          success: false,
          errorMessage: `Unable to find "${extractedLocation}". Please try a different format like "City, State" or "City, Country".`
        };
      }

      // Step 5: Optimize location for websearch
      const optimizedLocation = this.optimizeLocationForWebsearch(location);

      return {
        success: true,
        location: optimizedLocation,
        formattedLocationQuery: extractedLocation
      };

    } catch (error) {
      console.error('Location parsing error:', error);
      return {
        success: false,
        errorMessage: 'An error occurred while processing your location. Please try again.'
      };
    }
  }

  /**
   * Clean and sanitize user input
   */
  private sanitizeInput(input: string): string {
    return input
      .trim()
      .replace(/[^\w\s,.-]/g, '') // Remove special chars except common location punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .toLowerCase();
  }

  /**
   * Validate location input before processing
   */
  private validateLocationInput(input: string): { isValid: boolean; errorMessage?: string } {
    if (input.length < 2) {
      return {
        isValid: false,
        errorMessage: 'Location must be at least 2 characters long.'
      };
    }

    if (input.length > 100) {
      return {
        isValid: false,
        errorMessage: 'Location input is too long. Please use a shorter location name.'
      };
    }

    // Check for non-location patterns
    const nonLocationPatterns = [
      /^(hello|hi|hey|help|what|who|how|why)/i,
      /^(animal|bird|fish|mammal|reptile)/i,
      /^(yes|no|ok|maybe)/i,
      /^[0-9]+$/
    ];

    if (nonLocationPatterns.some(pattern => pattern.test(input))) {
      return {
        isValid: false,
        errorMessage: 'Please provide a location such as a city, state, or country name.'
      };
    }

    return { isValid: true };
  }

  /**
   * Extract location from various input formats
   */
  private extractLocationFromInput(input: string): string | null {
    // Pattern 1: "I am in/live in/from [location]"
    const locationPhrases = input.match(/(?:i\s+(?:am|live)\s+in|i\s+am\s+from|in|near|around|at|from)\s+([^.!?]+)/i);
    if (locationPhrases) {
      return this.formatLocation(locationPhrases[1].trim());
    }

    // Pattern 2: "City, State/Country" format
    const cityStateMatch = input.match(/([a-z\s]+),\s*([a-z\s]+)/i);
    if (cityStateMatch) {
      return this.formatLocation(`${cityStateMatch[1].trim()}, ${cityStateMatch[2].trim()}`);
    }

    // Pattern 3: Single location name (city, state, or country)
    const singleLocationMatch = input.match(/^([a-z\s]+)$/i);
    if (singleLocationMatch) {
      return this.formatLocation(singleLocationMatch[1].trim());
    }

    return null;
  }

  /**
   * Format location for better geocoding success
   */
  private formatLocation(location: string): string {
    // Proper case the location
    return location
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Check if location is ambiguous and needs disambiguation
   */
  private async checkForAmbiguousLocation(locationQuery: string): Promise<{
    needsDisambiguation: boolean;
    options?: DisambiguationOption[];
  }> {
    // Common ambiguous city names
    const ambiguousCities = new Map<string, DisambiguationOption[]>([
      ['Paris', [
        {
          displayName: 'Paris, France',
          searchQuery: 'Paris, France',
          description: 'Capital city of France',
          country: 'France'
        },
        {
          displayName: 'Paris, Texas',
          searchQuery: 'Paris, Texas, USA',
          description: 'City in Texas, United States',
          country: 'United States',
          region: 'Texas'
        }
      ]],
      ['London', [
        {
          displayName: 'London, England',
          searchQuery: 'London, England, UK',
          description: 'Capital city of England and the UK',
          country: 'United Kingdom'
        },
        {
          displayName: 'London, Ontario',
          searchQuery: 'London, Ontario, Canada',
          description: 'City in Ontario, Canada',
          country: 'Canada',
          region: 'Ontario'
        }
      ]],
      ['Portland', [
        {
          displayName: 'Portland, Oregon',
          searchQuery: 'Portland, Oregon, USA',
          description: 'City in Oregon, United States',
          country: 'United States',
          region: 'Oregon'
        },
        {
          displayName: 'Portland, Maine',
          searchQuery: 'Portland, Maine, USA',
          description: 'City in Maine, United States',
          country: 'United States',
          region: 'Maine'
        }
      ]],
      ['Cambridge', [
        {
          displayName: 'Cambridge, England',
          searchQuery: 'Cambridge, England, UK',
          description: 'University city in England',
          country: 'United Kingdom'
        },
        {
          displayName: 'Cambridge, Massachusetts',
          searchQuery: 'Cambridge, Massachusetts, USA',
          description: 'City in Massachusetts, United States',
          country: 'United States',
          region: 'Massachusetts'
        }
      ]],
      ['Springfield', [
        {
          displayName: 'Springfield, Illinois',
          searchQuery: 'Springfield, Illinois, USA',
          description: 'Capital city of Illinois',
          country: 'United States',
          region: 'Illinois'
        },
        {
          displayName: 'Springfield, Massachusetts',
          searchQuery: 'Springfield, Massachusetts, USA',
          description: 'City in Massachusetts, United States',
          country: 'United States',
          region: 'Massachusetts'
        },
        {
          displayName: 'Springfield, Missouri',
          searchQuery: 'Springfield, Missouri, USA',
          description: 'City in Missouri, United States',
          country: 'United States',
          region: 'Missouri'
        }
      ]]
    ]);

    const normalizedQuery = locationQuery.toLowerCase().trim();

    // Check for exact matches in ambiguous cities
    for (const [cityName, options] of ambiguousCities.entries()) {
      if (normalizedQuery === cityName.toLowerCase()) {
        return {
          needsDisambiguation: true,
          options
        };
      }
    }

    // If it's just a common city name without state/country context, use AI to check
    if (!locationQuery.includes(',') && locationQuery.split(' ').length <= 2) {
      try {
        const aiDisambiguation = await this.aiDisambiguationCheck(locationQuery);
        if (aiDisambiguation.needsDisambiguation) {
          return aiDisambiguation;
        }
      } catch (error) {
        console.warn('AI disambiguation check failed:', error);
      }
    }

    return { needsDisambiguation: false };
  }

  /**
   * Use AI to check for location disambiguation needs
   */
  private async aiDisambiguationCheck(locationQuery: string): Promise<{
    needsDisambiguation: boolean;
    options?: DisambiguationOption[];
  }> {
    if (!process.env.OPENAI_API_KEY) {
      return { needsDisambiguation: false };
    }

    try {
      const result = await generateText({
        model: openai('gpt-4o'),
        system: `You are a location disambiguation expert. Determine if a location name is ambiguous and needs clarification.`,
        prompt: `Location: "${locationQuery}"

Is this location name ambiguous (meaning there are multiple well-known places with this exact name)?

If YES, provide 2-4 most common options in this exact format:

NEEDS_DISAMBIGUATION
1. Full Location Name - Description - Country - Region(optional)
2. Full Location Name - Description - Country - Region(optional)

If NO (unambiguous or very clearly refers to one major place), respond:

NO_DISAMBIGUATION_NEEDED

Examples:
- "Paris" → NEEDS_DISAMBIGUATION (Paris, France vs Paris, Texas)
- "Tokyo" → NO_DISAMBIGUATION_NEEDED (clearly refers to Tokyo, Japan)
- "Birmingham" → NEEDS_DISAMBIGUATION (Birmingham, England vs Birmingham, Alabama)`
      });

      if (result.text.includes('NEEDS_DISAMBIGUATION')) {
        const options = this.parseAiDisambiguationResponse(result.text);
        return {
          needsDisambiguation: true,
          options
        };
      }

      return { needsDisambiguation: false };
    } catch (error) {
      console.error('AI disambiguation error:', error);
      return { needsDisambiguation: false };
    }
  }

  /**
   * Parse AI disambiguation response into structured options
   */
  private parseAiDisambiguationResponse(response: string): DisambiguationOption[] {
    const options: DisambiguationOption[] = [];
    const lines = response.split('\n');

    for (const line of lines) {
      const match = line.match(/^\d+\.\s*([^-]+)\s*-\s*([^-]+)\s*-\s*([^-]+)(?:\s*-\s*(.+))?/);
      if (match) {
        const [, fullName, description, country, region] = match;

        options.push({
          displayName: fullName.trim(),
          searchQuery: fullName.trim(),
          description: description.trim(),
          country: country.trim(),
          region: region?.trim()
        });
      }
    }

    return options;
  }

  /**
   * Generate alternative query formats if initial geocoding fails
   */
  private generateAlternativeQueries(originalQuery: string): string[] {
    const alternatives: string[] = [];

    // If it's just a city name, try adding common country/state suffixes
    if (!originalQuery.includes(',')) {
      alternatives.push(
        `${originalQuery}, USA`,
        `${originalQuery}, United States`,
        `${originalQuery}, Canada`,
        `${originalQuery}, United Kingdom`,
        `${originalQuery}, Australia`
      );
    }

    // Try different formatting
    if (originalQuery.includes(',')) {
      const parts = originalQuery.split(',').map(p => p.trim());
      if (parts.length === 2) {
        alternatives.push(
          `${parts[0]} ${parts[1]}`, // Remove comma
          `${parts[1]} ${parts[0]}`, // Reverse order
        );
      }
    }

    return alternatives;
  }

  /**
   * Optimize location data for websearch queries
   */
  private optimizeLocationForWebsearch(location: Location): Location {
    // Create optimized display name for web search
    let optimizedDisplayName = location.displayName;

    // For US locations, prefer "City, State" format
    if (location.country?.toLowerCase().includes('united states') && location.city && location.state) {
      optimizedDisplayName = `${location.city}, ${location.state}, United States`;
    }
    // For other countries, prefer "City, Country" format
    else if (location.city && location.country && !location.state) {
      optimizedDisplayName = `${location.city}, ${location.country}`;
    }
    // For state/province level searches
    else if (location.state && location.country && !location.city) {
      optimizedDisplayName = `${location.state}, ${location.country}`;
    }

    return {
      ...location,
      displayName: optimizedDisplayName
    };
  }

  /**
   * Handle user selection from disambiguation options
   */
  async handleDisambiguationSelection(selectedOption: DisambiguationOption): Promise<LocationParsingResult> {
    try {
      const location = await geocodeLocation(selectedOption.searchQuery);

      if (!location) {
        return {
          success: false,
          errorMessage: `Unable to find location data for ${selectedOption.displayName}. Please try a different location.`
        };
      }

      const optimizedLocation = this.optimizeLocationForWebsearch(location);

      return {
        success: true,
        location: optimizedLocation,
        formattedLocationQuery: selectedOption.searchQuery
      };
    } catch (error) {
      console.error('Disambiguation selection error:', error);
      return {
        success: false,
        errorMessage: 'An error occurred while processing your selection. Please try again.'
      };
    }
  }

  /**
   * Format disambiguation options for user display
   */
  formatDisambiguationMessage(options: DisambiguationOption[]): string {
    let message = `🌍 **I found multiple places with that name. Which one did you mean?**\n\n`;

    options.forEach((option, index) => {
      message += `**${index + 1}.** ${option.displayName}\n`;
      message += `   ${option.description}\n\n`;
    });

    message += `Please reply with the **number** (1, 2, etc.) of your intended location.`;

    return message;
  }
}

// Export convenience functions
export const locationAgent = LocationAgent.getInstance();

export async function parseUserLocation(userInput: string): Promise<LocationParsingResult> {
  return locationAgent.parseLocation(userInput);
}

export async function handleLocationDisambiguation(
  selectedOption: DisambiguationOption
): Promise<LocationParsingResult> {
  return locationAgent.handleDisambiguationSelection(selectedOption);
}