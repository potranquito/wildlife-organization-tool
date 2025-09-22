import { NextRequest, NextResponse } from 'next/server';
import {
  geocodeLocation,
  findSpeciesByLocation,
  getSpeciesInfo,
  findConservationOrganizations,
  type Location,
  type Species
} from '@/lib/conservation-tools';
import {
  parseUserLocation,
  handleLocationDisambiguation,
  type LocationParsingResult,
  type DisambiguationOption
} from '@/lib/location-agent';
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
const sessions = new Map<string, {
  location?: Location,
  species?: Species[],
  step: 'location' | 'disambiguation' | 'animal' | 'completed',
  disambiguationOptions?: DisambiguationOption[]
}>();


export async function POST(request: NextRequest) {
  try {
    const { message, sessionId = 'default' } = await request.json();

    console.log(`🎯 CHAT API TRIGGERED - Session: ${sessionId}, Message: "${message}"`);

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
      delete session.disambiguationOptions;
      sessions.set(sessionId, session);
    }

    // Check if user is providing a new location while in animal selection mode
    if (session.step === 'animal' && session.location) {
      // Only check for explicit location patterns, not animal names
      const locationIndicators = [
        ...CONFIG.patterns.locationIndicators,
        createCountryPattern(),
        createStatePattern(),
        createProvincePattern()
      ];

      const isLocationInput = locationIndicators.some(pattern => pattern.test(message.trim()));

      // Additional check: make sure this isn't just an animal name from our species list
      const isAnimalFromList = session.species?.some(species => {
        const normalizedMessage = message.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
        const normalizedCommonName = species.commonName.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
        const normalizedScientificName = species.scientificName.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');

        return normalizedMessage === normalizedCommonName ||
               normalizedMessage === normalizedScientificName ||
               message.toLowerCase().trim() === species.commonName.toLowerCase() ||
               message.toLowerCase().trim() === species.scientificName.toLowerCase();
      });

      if (isLocationInput && !isAnimalFromList) {
        // Reset session for new location search
        session.step = 'location';
        delete session.location;
        delete session.species;
        delete session.disambiguationOptions;
        sessions.set(sessionId, session);
      }
    }

    // DISAMBIGUATION STEP: Handle user selection from disambiguation options
    if (session.step === 'disambiguation' && session.disambiguationOptions) {
      const selectionMatch = message.match(/^(\d+)$/);
      if (selectionMatch) {
        const optionIndex = parseInt(selectionMatch[1]) - 1;

        if (optionIndex >= 0 && optionIndex < session.disambiguationOptions.length) {
          const selectedOption = session.disambiguationOptions[optionIndex];
          const result = await handleLocationDisambiguation(selectedOption);

          if (result.success && result.location) {
            // Get species list from live data sources
            console.log(`📍 FETCHING SPECIES for location: ${result.location.displayName}`);
            let species = await findSpeciesByLocation(result.location);
            console.log(`🐾 FOUND ${species.length} species for ${result.location.displayName}`);

            // Save location, species, and move to next step
            session.location = result.location;
            session.species = species;
            session.step = 'animal';
            delete session.disambiguationOptions;
            sessions.set(sessionId, session);

            // If no species found, provide a helpful message
            if (species.length === 0) {
              const response = `🚫 **Unable to find wildlife data for ${result.location.displayName}**\n\nThis could be due to:\n• **API connectivity issues** (OpenAI services may be temporarily unavailable)\n• **Limited coverage** for this specific location\n• **Server overload** during peak usage\n\n💡 **Try these alternatives:**\n• Enter a **major nearby city** (e.g., "Miami, Florida" instead of just "Miami")\n• Use a **state or province name** (e.g., "California", "Ontario")\n• Try again in a few minutes\n\nExamples: "New York City", "Toronto, Canada", "Los Angeles"`;
              return NextResponse.json({ response });
            }

            // Display species list
            const hasEndangeredSpecies = species.some(s => s.conservationStatus &&
              ['Critically Endangered', 'Endangered', 'Vulnerable', 'Near Threatened'].includes(s.conservationStatus));

            const locationDisplayName = result.location.city || result.location.state || result.location.country || 'this location';
            let response = hasEndangeredSpecies
              ? `**Endangered & Threatened Species near ${locationDisplayName}:**\n\n`
              : `**Wildlife near ${locationDisplayName}:**\n\n`;

            species.slice(0, CONFIG.ui.maxDisplayedSpecies).forEach((animal) => {
              const status = animal.conservationStatus && animal.conservationStatus !== 'Unknown'
                ? ` (${animal.conservationStatus})`
                : '';
              response += `- ${animal.commonName}${status}\n`;
            });

            response += `\n**⚠️ IMPORTANT: You must select one of the animals listed above.**\n\nType the **animal name only** (without conservation status) to find conservation organizations. For example: "Florida Panther" or "West Indian Manatee".`;

            return NextResponse.json({ response });
          } else {
            const response = `❌ **Unable to process that selection.** Please try entering your location again.\n\nUse formats like:\n• "Miami, Florida"\n• "Toronto, Canada"\n• "California"`;
            session.step = 'location';
            delete session.disambiguationOptions;
            sessions.set(sessionId, session);
            return NextResponse.json({ response });
          }
        }
      }

      // Invalid selection number
      const response = `❌ **Please select a valid option number.**\n\n${formatDisambiguationMessage(session.disambiguationOptions)}`;
      return NextResponse.json({ response });
    }

    // AGENT 1: Location → Animal List (Enhanced with disambiguation)
    if (session.step === 'location' || !session.location) {
      // Use the new enhanced location agent
      const locationResult = await parseUserLocation(message);

      if (locationResult.success && locationResult.location) {
        // Get species list from live data sources
        console.log(`📍 FETCHING SPECIES for location: ${locationResult.location.displayName}`);
        let species = await findSpeciesByLocation(locationResult.location);
        console.log(`🐾 FOUND ${species.length} species for ${locationResult.location.displayName}`);

        // Save location, species, and move to next step
        session.location = locationResult.location;
        session.species = species;
        session.step = 'animal';
        sessions.set(sessionId, session);

        // If no species found, provide a helpful message
        if (species.length === 0) {
          const response = `🚫 **Unable to find wildlife data for ${locationResult.location.displayName}**\n\nThis could be due to:\n• **API connectivity issues** (OpenAI services may be temporarily unavailable)\n• **Limited coverage** for this specific location\n• **Server overload** during peak usage\n\n💡 **Try these alternatives:**\n• Enter a **major nearby city** (e.g., "Miami, Florida" instead of just "Miami")\n• Use a **state or province name** (e.g., "California", "Ontario")\n• Try again in a few minutes\n\nExamples: "New York City", "Toronto, Canada", "Los Angeles"`;
          return NextResponse.json({ response });
        }

        // Display species list
        const hasEndangeredSpecies = species.some(s => s.conservationStatus &&
          ['Critically Endangered', 'Endangered', 'Vulnerable', 'Near Threatened'].includes(s.conservationStatus));

        const locationDisplayName = locationResult.location.city || locationResult.location.state || locationResult.location.country || 'this location';
        let response = hasEndangeredSpecies
          ? `**Endangered & Threatened Species near ${locationDisplayName}:**\n\n`
          : `**Wildlife near ${locationDisplayName}:**\n\n`;

        species.slice(0, CONFIG.ui.maxDisplayedSpecies).forEach((animal) => {
          const status = animal.conservationStatus && animal.conservationStatus !== 'Unknown'
            ? ` (${animal.conservationStatus})`
            : '';
          response += `- ${animal.commonName}${status}\n`;
        });

        response += `\n**⚠️ IMPORTANT: You must select one of the animals listed above.**\n\nType the **animal name only** (without conservation status) to find conservation organizations. For example: "Florida Panther" or "West Indian Manatee".`;

        return NextResponse.json({ response });

      } else if (locationResult.needsDisambiguation && locationResult.disambiguationOptions) {
        // Location needs disambiguation
        session.step = 'disambiguation';
        session.disambiguationOptions = locationResult.disambiguationOptions;
        sessions.set(sessionId, session);

        const response = formatDisambiguationMessage(locationResult.disambiguationOptions);
        return NextResponse.json({ response });

      } else {
        // Location parsing failed
        const errorMessage = locationResult.errorMessage || 'Could not understand your location input.';
        const response = `🌍 **${errorMessage}**\n\nPlease enter your location in one of these formats:\n\n• **City and state**: "Miami, Florida"\n• **City and country**: "Toronto, Canada"\n• **Just a city**: "Seattle"\n• **Just a state**: "California"\n• **A country**: "Canada"\n\nTry entering your location now!`;
        return NextResponse.json({ response });
      }
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

      // ENHANCED matching: Accept animals from the species list with various input formats
      // First, try simple direct matches
      const trimmedMessage = message.trim();
      const trimmedLowerMessage = lowerMessage.trim();

      // Strip conservation status from user input (e.g., "Florida Panther (Endangered)" -> "Florida Panther")
      const cleanedMessage = trimmedMessage.replace(/\s*\([^)]*\)\s*$/, '').trim();
      const cleanedLowerMessage = cleanedMessage.toLowerCase();

      // Try exact matches first (case insensitive)
      for (const s of species) {
        if (!s.commonName || !s.scientificName) continue;

        const commonNameLower = s.commonName.toLowerCase().trim();
        const scientificNameLower = s.scientificName.toLowerCase().trim();

        // Exact match (most reliable) - check both original and cleaned input
        if (trimmedLowerMessage === commonNameLower || trimmedLowerMessage === scientificNameLower ||
            cleanedLowerMessage === commonNameLower || cleanedLowerMessage === scientificNameLower) {
          selectedAnimal = s.commonName;
          matchedSpecies = s;
          break;
        }
      }

      // If no exact match, try normalized matches
      if (!selectedAnimal) {
        const normalizedMessage = trimmedLowerMessage.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
        const normalizedCleanedMessage = cleanedLowerMessage.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');

        for (const s of species) {
          if (!s.commonName || !s.scientificName) continue;

          const normalizedCommonName = s.commonName.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
          const normalizedScientificName = s.scientificName.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');

          if (normalizedMessage === normalizedCommonName || normalizedMessage === normalizedScientificName ||
              normalizedCleanedMessage === normalizedCommonName || normalizedCleanedMessage === normalizedScientificName) {
            selectedAnimal = s.commonName;
            matchedSpecies = s;
            break;
          }
        }
      }

      // If still no match, try partial/contains matches
      if (!selectedAnimal) {
        for (const s of species) {
          if (!s.commonName || !s.scientificName) continue;

          const commonNameLower = s.commonName.toLowerCase().trim();
          const scientificNameLower = s.scientificName.toLowerCase().trim();

          // Check if the user input contains the animal name or vice versa
          if (trimmedLowerMessage.includes(commonNameLower) || commonNameLower.includes(trimmedLowerMessage) ||
              trimmedLowerMessage.includes(scientificNameLower) || scientificNameLower.includes(trimmedLowerMessage)) {
            selectedAnimal = s.commonName;
            matchedSpecies = s;
            break;
          }
        }
      }

      if (selectedAnimal && matchedSpecies) {
        console.log(`🏢 SEARCHING ORGANIZATIONS for ${selectedAnimal} in ${session.location?.displayName}`);
        const organizations = await findConservationOrganizations(matchedSpecies, session.location);
        console.log(`🔍 FOUND ${organizations.length} organizations for ${selectedAnimal}`);

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

// Helper function to format disambiguation messages
function formatDisambiguationMessage(options: DisambiguationOption[]): string {
  let message = `🌍 **I found multiple places with that name. Which one did you mean?**\n\n`;

  options.forEach((option, index) => {
    message += `**${index + 1}.** ${option.displayName}\n`;
    message += `   ${option.description}\n\n`;
  });

  message += `Please reply with the **number** (1, 2, etc.) of your intended location.`;

  return message;
}