import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { NextRequest, NextResponse } from 'next/server';
import {
  geocodeLocation,
  findSpeciesByLocation,
  getSpeciesInfo,
  findConservationOrganizations,
  type Location,
  type Species
} from '@/lib/conservation-tools';
import { WILDLIFE_POETRY_AGENT_PROMPT } from '@/lib/agent-prompts';
import { findPoemByAnimal, getRandomPoem } from '@/lib/animal-poems-rag';
import {
  CONFIG,
  createCountryPattern,
  createStatePattern,
  createProvincePattern,
  createAnimalPattern,
  createAnimalDescriptivePattern
} from '@/lib/config';

// Simple in-memory session storage (in production, use Redis or database)
const sessions = new Map<string, { location?: Location, species?: Species[], step: 'location' | 'animal' | 'completed' }>();


export async function POST(request: NextRequest) {
  try {
    const { message, sessionId = 'default' } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const lowerMessage = message.toLowerCase();

    // Get or create session
    let session = sessions.get(sessionId) || { step: 'location' };
    sessions.set(sessionId, session);

    // If session is completed (after poem), restart on any new input
    if (session.step === 'completed') {
      console.log('Session completed, restarting for new conversation');
      session.step = 'location';
      delete session.location;
      delete session.species;
      sessions.set(sessionId, session);
    }

    // Check if user is providing a new location while in animal selection mode
    if (session.step === 'animal' && session.location) {
      // Simple heuristic: if the message looks like a location, reset to location step
      const locationIndicators = [
        ...CONFIG.patterns.locationIndicators,
        createCountryPattern(),
        createStatePattern(),
        createProvincePattern()
      ];

      const isLocationInput = locationIndicators.some(pattern => pattern.test(message.trim()));

      if (isLocationInput) {
        // Reset session for new location search
        session.step = 'location';
        delete session.location;
        delete session.species;
        sessions.set(sessionId, session);
      }
    }

    // AGENT 1: Location → Animal List
    if (session.step === 'location' || !session.location) {
      // Enhanced location parsing with guardrails
      let locationQuery: string | null = null;
      console.log(`Raw message: "${message}"`);
      console.log(`Lower message: "${lowerMessage}"`);

      // Guardrail: Check for non-location inputs first
      const animalPattern = createAnimalPattern();
      const nonLocationInputs = [
        ...CONFIG.patterns.nonLocationInputs,
        animalPattern,
        new RegExp(`^.{${CONFIG.validation.maxVeryLongMessage},}$`) // Very long messages are probably not locations
      ];

      const isNonLocationInput = nonLocationInputs.some(pattern => pattern.test(message.trim()));

      if (isNonLocationInput) {
        const response = `🌍 **Please provide your location to get started!**\n\nI need to know where you're located to find local wildlife and conservation organizations. You can enter:\n\n• **City and state**: "Miami, Florida"\n• **Just a city**: "Seattle" \n• **Just a state**: "California"\n• **A country**: "Canada"\n\nTry entering your location now!`;
        return NextResponse.json({ response });
      }

      // Pattern 1: "I am in Las Vegas" or "I live in Denver, Colorado"
      const locationPattern1 = message.match(/(?:i\s+(?:am|live)\s+in|in|near|around|at|from)\s+([^.!?]+)/i);
      if (locationPattern1) {
        locationQuery = locationPattern1[1].trim();
        console.log(`Pattern 1 matched: "${locationQuery}"`);
      }

      // Pattern 2: City, State format (case insensitive) - "Las Vegas, Nevada" or "miami, florida"
      if (!locationQuery) {
        // Only match if there's a clear separator (comma or multiple words suggesting city + state)
        const cityStateMatch = message.match(/([A-Za-z]+(?:\s+[A-Za-z]+)*),\s*([A-Za-z]+(?:\s+[A-Za-z]+)*)/i);
        if (cityStateMatch) {
          locationQuery = `${cityStateMatch[1]}, ${cityStateMatch[2]}`;
          console.log(`Pattern 2 matched: "${locationQuery}"`);
        }
      }

      // Pattern 3: Country names - dynamic pattern from config
      if (!locationQuery) {
        const countryPattern = createCountryPattern();
        const countryMatch = message.match(countryPattern);
        if (countryMatch) {
          locationQuery = countryMatch[1];
          console.log(`Pattern 3 matched: "${locationQuery}"`);
        }
      }

      // Pattern 4: State names only - dynamic pattern from config
      if (!locationQuery) {
        const statePattern = createStatePattern();
        const stateMatch = message.match(statePattern);
        if (stateMatch) {
          locationQuery = stateMatch[1];
        }
      }

      // Pattern 5: Canadian province names - dynamic pattern from config
      if (!locationQuery) {
        const provincePattern = createProvincePattern();
        const provinceMatch = message.match(provincePattern);
        if (provinceMatch) {
          locationQuery = provinceMatch[1];
        }
      }

      // Pattern 6: City name only - case insensitive (but be more selective)
      if (!locationQuery) {
        const cityMatch = message.match(/^([A-Za-z]+(?:\s+[A-Za-z]+)*)$/i);
        if (cityMatch &&
            cityMatch[1].length > CONFIG.validation.minLocationLength &&
            cityMatch[1].length < CONFIG.validation.maxLocationLength) {
          // Additional check: make sure it's not a common non-location word
          const allExcludedWords = [
            ...CONFIG.animals.excludedWords,
            ...CONFIG.animals.commonNames
          ];
          const words = cityMatch[1].toLowerCase().split(' ');
          const isAnimalName = words.some((word: string) => allExcludedWords.includes(word)) ||
                              createAnimalDescriptivePattern().test(cityMatch[1]);

          if (!isAnimalName) {
            locationQuery = cityMatch[1];
          }
        }
      }

      // Pattern 7: Any reasonable location string (fallback, but more restrictive)
      if (!locationQuery &&
          message.trim().length > CONFIG.validation.minLocationLength &&
          message.trim().length < CONFIG.validation.maxLocationLength &&
          /^[A-Za-z\s,.-]+$/.test(message.trim())) {
        // Only if it contains geographical indicators or has the right structure
        if (message.includes(',') || /\b(city|town|village|county|state|province|country)\b/i.test(message)) {
          locationQuery = message.trim();
        }
      }

      if (locationQuery) {
        console.log(`Selected location query: "${locationQuery}"`);
        const location = await geocodeLocation(locationQuery);

        if (location) {
          // Get species list from live data sources
          let species = await findSpeciesByLocation(location);

          // Save location, species, and move to next step
          session.location = location;
          session.species = species;
          session.step = 'animal';
          sessions.set(sessionId, session);

          // If no species found, provide a helpful message
          if (species.length === 0) {
            const response = `I couldn't find any wildlife data for ${location.displayName} at the moment. This could be due to limited data coverage in this area or temporary API issues. Please try a nearby major city or check back later.`;
            return NextResponse.json({ response });
          }

          // Check if we got endangered species from IUCN vs general wildlife
          const hasEndangeredSpecies = species.some(s => s.conservationStatus &&
            ['Critically Endangered', 'Endangered', 'Vulnerable', 'Near Threatened'].includes(s.conservationStatus));

          const locationDisplayName = location.city || location.state || location.country || 'this location';
          let response = hasEndangeredSpecies
            ? `**Endangered & Threatened Species near ${locationDisplayName}:**\n\n`
            : `**Wildlife near ${locationDisplayName}:**\n\n`;

          species.slice(0, CONFIG.ui.maxDisplayedSpecies).forEach((animal) => {
            const status = animal.conservationStatus && animal.conservationStatus !== 'Unknown'
              ? ` (${animal.conservationStatus})`
              : '';
            response += `- ${animal.commonName}${status}\n`;
          });

          response += `\n**⚠️ IMPORTANT: You must select one of the animals listed above.**\n\nType the **exact name** of one of these animals to find conservation organizations. No other input will be accepted.`;

          return NextResponse.json({ response });
        }
      }

      // Ask for location if not provided
      const response = `🌍 **I need your location to find local wildlife!**\n\nPlease enter your location in one of these formats:\n\n• **City and state**: "Miami, Florida"\n• **Just a city**: "Seattle" \n• **Just a state**: "California"\n• **A country**: "Canada"\n\nTry adding a location please!`;
      return NextResponse.json({ response });
    }

    // AGENT 2: Animal Selection → Organizations
    if (session.step === 'animal' && session.location && session.species) {
      // Use the previously found species for this location to check against user input
      const species = session.species;

      // Guardrail: Check for non-animal inputs first
      const nonAnimalInputs = [
        ...CONFIG.patterns.nonAnimalInputs,
        new RegExp(`^.{${CONFIG.validation.maxVeryLongMessage},}$`) // Very long messages
      ];

      const isNonAnimalInput = nonAnimalInputs.some(pattern => pattern.test(message.trim()));

      if (isNonAnimalInput) {
        let response = `🐾 **Please select an animal from the list!**\n\nChoose one of these animals found near ${session.location.city || session.location.state || session.location.country}:\n\n`;
        species.slice(0, 8).forEach((animal) => {
          const status = animal.conservationStatus && animal.conservationStatus !== 'Unknown'
            ? ` (${animal.conservationStatus})`
            : '';
          response += `- **${animal.commonName}**${status}\n`;
        });
        response += `\n**⚠️ You must select one of the animals listed above.**\n\nType the **exact name** of one of these animals to find conservation organizations.`;
        return NextResponse.json({ response });
      }

      let selectedAnimal: string | undefined;
      let matchedSpecies: Species | undefined;

      // FLEXIBLE matching: Accept animals from the species list with various input formats
      // Normalize the user input for better matching
      const normalizedMessage = lowerMessage.trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');

      for (const s of species) {
        const commonNameLower = s.commonName.toLowerCase();
        const scientificNameLower = s.scientificName.toLowerCase();
        const normalizedCommonName = commonNameLower.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
        const normalizedScientificName = scientificNameLower.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');

        // Exact match on normalized names
        if (normalizedMessage === normalizedCommonName || normalizedMessage === normalizedScientificName) {
          selectedAnimal = s.commonName;
          matchedSpecies = s;
          break;
        }

        // Exact match on original lowercase (fallback)
        if (lowerMessage.trim() === commonNameLower || lowerMessage.trim() === scientificNameLower) {
          selectedAnimal = s.commonName;
          matchedSpecies = s;
          break;
        }

        // Check if message contains the full animal name
        if (lowerMessage.includes(commonNameLower) || lowerMessage.includes(scientificNameLower)) {
          selectedAnimal = s.commonName;
          matchedSpecies = s;
          break;
        }

        // Check for partial matches with significant words (e.g., "eagle" matches "Bald Eagle")
        const words = commonNameLower.split(' ');
        for (const word of words) {
          if (word.length > CONFIG.validation.minAnimalNameLength && lowerMessage.includes(word)) {
            // Make sure it's not a common word that could match multiple animals
            if (!CONFIG.animals.excludedWords.includes(word)) {
              selectedAnimal = s.commonName;
              matchedSpecies = s;
              break;
            }
          }
        }
        if (selectedAnimal) break;
      }

      // Only try keyword matching if no direct match found, and only for animals in our list
      if (!selectedAnimal) {
        for (const s of species) {
          const commonNameLower = s.commonName.toLowerCase();

          // Check for animal type keywords that match our specific animals
          for (const keyword of CONFIG.animals.commonNames) {
            if (lowerMessage.includes(keyword) && commonNameLower.includes(keyword)) {
              selectedAnimal = s.commonName;
              matchedSpecies = s;
              break;
            }
          }
          if (selectedAnimal) break;
        }
      }

      if (selectedAnimal && matchedSpecies) {
        const organizations = await findConservationOrganizations(matchedSpecies, session.location);

        let response = `**${selectedAnimal} Conservation Organizations:**\n\n`;

        if (organizations.length > 0) {
          organizations.forEach((org) => {
            response += `- **${org.name}**\n`;
            if (org.website && org.website !== '#') {
              response += `  ${org.website}\n`;
            }
            response += `\n`;
          });
          response += `Contact these organizations to help protect ${selectedAnimal}.`;
        } else {
          response += `- Contact your state wildlife department\n- Search for local conservation groups\n\nThese can help you learn how to protect ${selectedAnimal}.`;
        }

        // Mark session as completed - next input will restart
        session.step = 'completed';
        sessions.set(sessionId, session);

        return NextResponse.json({ response });
      } else {
        // Animal not recognized, show available options from the original list ONLY
        if (species.length > 0) {
          let response = `❌ **"${message}" is not valid.**\n\n**You MUST choose from this exact list** of animals found near ${session.location.city || session.location.state || session.location.country}:\n\n`;
          species.slice(0, CONFIG.ui.maxDisplayedSpecies).forEach((animal) => {
            const status = animal.conservationStatus && animal.conservationStatus !== 'Unknown'
              ? ` (${animal.conservationStatus})`
              : '';
            response += `- **${animal.commonName}**${status}\n`;
          });
          response += `\n**Please type the exact name** of one of these animals to find conservation organizations.`;
          return NextResponse.json({ response });
        } else {
          const response = `I couldn't find any animals for your location. Please try a different location.`;
          return NextResponse.json({ response });
        }
      }
    }

    // Fallback
    const response = `🌍 **I need your location to find local wildlife!**\n\nPlease enter your location to get started.\n\nTry adding a location please!`;
    return NextResponse.json({ response });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    );
  }
}