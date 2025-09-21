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

// Simple in-memory session storage (in production, use Redis or database)
const sessions = new Map<string, { location?: Location, species?: Species[], step: 'location' | 'animal' }>();


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

    // AGENT 1: Location → Animal List
    if (session.step === 'location' || !session.location) {
      // Enhanced location parsing with guardrails
      let locationQuery: string | null = null;
      console.log(`Raw message: "${message}"`);
      console.log(`Lower message: "${lowerMessage}"`);

      // Guardrail: Check for non-location inputs first
      const nonLocationInputs = [
        /^(hello|hi|hey|what|who|when|how|why|help|support|info|about|contact)/i,
        /^(yes|no|ok|okay|sure|thanks|thank you|please)/i,
        /^(animal|wildlife|species|conservation|organization|find|search|show|list)/i,
        /^(eagle|bear|wolf|deer|fox|owl|hawk|salmon|turtle|frog|bat|snake|lizard|butterfly|crane|duck|rabbit|squirrel|mouse|rat|cat|lynx|otter|seal|whale|dolphin)/i,
        /^(bird|mammal|reptile|amphibian|fish)/i,
        /^[0-9]+$/, // Just numbers
        /^.{100,}$/ // Very long messages are probably not locations
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

      // Pattern 3: Country names - "United States", "Canada", "Mexico", etc.
      if (!locationQuery) {
        const countryMatch = message.match(/^(united states|usa|canada|mexico|united kingdom|uk|australia|brazil|germany|france|spain|italy|japan|china|india|nepal|bangladesh|pakistan|afghanistan|thailand|vietnam|cambodia|laos|myanmar|malaysia|singapore|indonesia|philippines|south korea|north korea|mongolia|russia|turkey|egypt|nigeria|kenya|ethiopia|ghana|morocco|algeria|tunisia|israel|saudi arabia|uae|iran|iraq|south africa|argentina|chile|colombia|peru|venezuela|ecuador|bolivia|paraguay|uruguay|netherlands|belgium|switzerland|austria|poland|czech republic|hungary|romania|bulgaria|croatia|serbia|greece|sweden|norway|denmark|finland)$/i);
        if (countryMatch) {
          locationQuery = countryMatch[1];
          console.log(`Pattern 3 matched: "${locationQuery}"`);
        }
      }

      // Pattern 4: State names only - "California", "Texas", "Florida", etc.
      if (!locationQuery) {
        const stateMatch = message.match(/^(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)$/i);
        if (stateMatch) {
          locationQuery = stateMatch[1];
        }
      }

      // Pattern 5: City name only - case insensitive (but be more selective)
      if (!locationQuery) {
        const cityMatch = message.match(/^([A-Za-z]+(?:\s+[A-Za-z]+)*)$/i);
        if (cityMatch && cityMatch[1].length > 2 && cityMatch[1].length < 50) {
          // Additional check: make sure it's not a common non-location word
          const commonWords = ['hello', 'help', 'animal', 'wildlife', 'species', 'conservation', 'organization', 'find', 'search', 'show', 'list', 'eagle', 'bear', 'wolf', 'deer', 'fox', 'owl', 'hawk', 'salmon', 'turtle', 'frog', 'bat', 'snake', 'lizard', 'butterfly', 'crane', 'duck', 'rabbit', 'squirrel', 'skunk', 'raccoon', 'beaver', 'otter', 'chipmunk', 'mouse', 'rat', 'vole', 'shrew', 'mole', 'weasel', 'marten', 'fisher', 'badger', 'porcupine', 'woodchuck', 'muskrat', 'opossum', 'moose', 'elk', 'caribou', 'bison', 'sheep', 'goat', 'pika', 'hare', 'bobcat', 'lynx', 'cougar', 'coyote', 'wolverine', 'seal', 'whale', 'dolphin', 'porpoise', 'walrus', 'manatee', 'dugong'];
          const words = cityMatch[1].toLowerCase().split(' ');
          const isAnimalName = words.some(word => commonWords.includes(word)) ||
                              /\b(striped|spotted|common|american|european|eastern|western|northern|southern|red|black|white|brown|gray|grey|blue|green|yellow|great|little|small|large|giant)\s+(skunk|fox|deer|bear|wolf|eagle|hawk|owl|duck|goose|frog|toad|turtle|snake|lizard|salamander|newt|rabbit|hare|squirrel|chipmunk|mouse|rat|bat|seal|whale|dolphin|otter)\b/i.test(cityMatch[1]);

          if (!isAnimalName) {
            locationQuery = cityMatch[1];
          }
        }
      }

      // Pattern 6: Any reasonable location string (fallback, but more restrictive)
      if (!locationQuery && message.trim().length > 2 && message.trim().length < 50 && /^[A-Za-z\s,.-]+$/.test(message.trim())) {
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

          species.slice(0, 8).forEach((animal) => {
            const status = animal.conservationStatus && animal.conservationStatus !== 'Unknown'
              ? ` (${animal.conservationStatus})`
              : '';
            response += `- ${animal.commonName}${status}\n`;
          });

          response += `\nType an animal name to find conservation organizations.`;

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
        /^(hello|hi|hey|what|who|when|how|why|help|support|info|about|contact)/i,
        /^(yes|no|ok|okay|sure|thanks|thank you|please)/i,
        /^(location|where|place|city|state|country)/i,
        /^(find|search|show|list|give|tell|get)/i,
        /^[0-9]+$/, // Just numbers
        /^.{100,}$/ // Very long messages
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
        response += `\nType the name of one of these animals to find conservation organizations.`;
        return NextResponse.json({ response });
      }

      let selectedAnimal: string | undefined;
      let matchedSpecies: Species | undefined;

      // STRICT matching: Only accept animals from the species list we provided
      // First, try exact matches against the actual species we found for this location
      for (const s of species) {
        const commonNameLower = s.commonName.toLowerCase();
        const scientificNameLower = s.scientificName.toLowerCase();

        // Exact match on full name
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
          if (word.length > 3 && lowerMessage.includes(word)) {
            // Make sure it's not a common word that could match multiple animals
            const commonWords = ['bird', 'fish', 'small', 'large', 'white', 'black', 'brown', 'red', 'blue', 'green'];
            if (!commonWords.includes(word)) {
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
          const animalKeywords = ['eagle', 'bear', 'wolf', 'deer', 'fox', 'owl', 'hawk', 'salmon', 'turtle', 'frog', 'bat', 'snake', 'lizard', 'butterfly', 'crane', 'duck', 'rabbit', 'squirrel', 'mouse', 'rat', 'cat', 'lynx', 'otter', 'seal', 'whale', 'dolphin'];

          for (const keyword of animalKeywords) {
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

        // Reset session for new conversation
        session.step = 'location';
        delete session.location;
        delete session.species;
        sessions.set(sessionId, session);

        return NextResponse.json({ response });
      } else {
        // Animal not recognized, show available options from the original list ONLY
        if (species.length > 0) {
          let response = `❌ **That animal wasn't found in your area.**\n\nPlease choose from these animals found near ${session.location.city || session.location.state || session.location.country}:\n\n`;
          species.slice(0, 8).forEach((animal) => {
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