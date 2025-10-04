import { NextRequest, NextResponse } from 'next/server';
import {
  type Location,
  type Species
} from '@/lib/conservation-tools';
import {
  parseUserLocation,
  handleLocationDisambiguation,
  type LocationParsingResult,
  type DisambiguationOption
} from '@/lib/location-agent';
import {
  CONFIG,
  createCountryPattern,
  createStatePattern,
  createProvincePattern,
  createAnimalPattern,
  createAnimalDescriptivePattern
} from '@/lib/config';
import { speciesFetcherMCP, getMCPClientManager } from '@/lib/mcp-client';

// Simple in-memory session storage (in production, use Redis or database)
// Use global variable to persist sessions across hot reloads in development
type SessionData = {
  location?: Location,
  species?: Species[],
  selectedAnimal?: Species,
  step: 'initial' | 'location' | 'disambiguation' | 'animal' | 'animal-location' | 'completed',
  disambiguationOptions?: DisambiguationOption[],
  mode?: 'location-first' | 'animal-first'
};

declare global {
  var sessionStore: Map<string, SessionData> | undefined;
}

const sessions = globalThis.sessionStore ?? new Map<string, SessionData>();
if (process.env.NODE_ENV !== 'production') {
  globalThis.sessionStore = sessions;
}


export async function POST(request: NextRequest) {
  try {
    const { message, sessionId = 'default' } = await request.json();

    console.log(`🎯 CHAT API TRIGGERED - Session: ${sessionId}, Message: "${message}"`);

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const lowerMessage = message.toLowerCase();

    // Check for "Surprise me" / random animal request
    if (lowerMessage.includes('surprise')) {
      // Pick a random endangered animal
      const randomAnimals = [
        { name: 'African Elephant', location: 'Kenya', scientificName: 'Loxodonta africana' },
        { name: 'Giant Panda', location: 'China', scientificName: 'Ailuropoda melanoleuca' },
        { name: 'Bengal Tiger', location: 'India', scientificName: 'Panthera tigris tigris' },
        { name: 'Polar Bear', location: 'Canada', scientificName: 'Ursus maritimus' },
        { name: 'Blue Whale', location: 'Pacific Ocean', scientificName: 'Balaenoptera musculus' },
        { name: 'Mountain Gorilla', location: 'Rwanda', scientificName: 'Gorilla beringei beringei' },
        { name: 'Sea Turtle', location: 'Australia', scientificName: 'Cheloniidae' },
        { name: 'Gray Wolf', location: 'United States', scientificName: 'Canis lupus' }
      ];

      const random = randomAnimals[Math.floor(Math.random() * randomAnimals.length)];

      console.log(`🎲 RANDOM ANIMAL SELECTED: ${random.name}`);

      // Create a fake location for the random animal
      const fakeLocation: Location = {
        displayName: random.location,
        country: random.location,
        lat: 0,
        lon: 0
      };

      // Create species object
      const randomSpecies: Species = {
        id: `random-${random.name}`,
        commonName: random.name,
        scientificName: random.scientificName,
        conservationStatus: 'Endangered'
      };

      // Search for organizations using MCP
      console.log(`🏢 SEARCHING ORGANIZATIONS for random animal: ${random.name}`);
      const organizations = await speciesFetcherMCP.searchConservationOrganizations(
        random.name,
        random.location,
        process.env.OPENAI_API_KEY || ''
      );
      console.log(`🔍 FOUND ${organizations.length} organizations for ${random.name}`);

      let response = `🎲 **Random Endangered Animal: ${random.name}**\n\n*${random.scientificName}* - Found in ${random.location}\n\n`;
      response += `**Conservation Organizations:**\n\n`;

      if (organizations.length > 0) {
        organizations.forEach((org: any) => {
          response += `• **${org.name}**\n`;
          if (org.website && org.website !== '#') {
            response += `  ${org.website}\n`;
          }
          response += `\n`;
        });
        response += `Contact these organizations to help protect the ${random.name}.`;
      } else {
        response += `• Contact your local wildlife conservation groups\n• Support international wildlife funds\n\nThese can help protect the ${random.name}.`;
      }

      return NextResponse.json({ response });
    }

    // Get or create session
    let session = sessions.get(sessionId);
    if (!session) {
      console.log(`📝 NEW SESSION CREATED: ${sessionId}`);
      session = { step: 'initial' };
      sessions.set(sessionId, session);
    } else {
      console.log(`📝 EXISTING SESSION FOUND: ${sessionId}, step: ${session.step}, mode: ${session.mode}, hasLocation: ${!!session.location}, hasSpecies: ${!!session.species}`);
    }

    // If session is completed (after organizations), inform user to use reset button
    if (session.step === 'completed') {
      console.log('Session completed - user should reset to start new search');
      const response = `✅ **Your search is complete!**\n\nTo search for another animal:\n• Click the **Reset** button to start a new search\n• Or refresh the page to begin again`;
      return NextResponse.json({ response });
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
        if (!species.commonName || !species.scientificName) return false;

        const userInput = message.toLowerCase().trim();
        const commonNameLower = species.commonName.toLowerCase().trim();
        const scientificNameLower = species.scientificName.toLowerCase().trim();

        // Strip conservation status from user input if present
        const cleanedUserInput = userInput.replace(/\s*\([^)]*\)\s*$/, '').trim();

        // Try exact matches first
        if (userInput === commonNameLower || userInput === scientificNameLower ||
            cleanedUserInput === commonNameLower || cleanedUserInput === scientificNameLower) {
          return true;
        }

        // Try normalized matches (remove punctuation, normalize spaces)
        const normalizedUserInput = userInput.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
        const normalizedCommonName = commonNameLower.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
        const normalizedScientificName = scientificNameLower.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();

        if (normalizedUserInput === normalizedCommonName || normalizedUserInput === normalizedScientificName) {
          return true;
        }

        // Try partial matches for compound names (e.g., "macaque" should match "Long-tailed Macaque")
        if (normalizedUserInput.length >= 4 &&
            (normalizedCommonName.includes(normalizedUserInput) || normalizedUserInput.includes(normalizedCommonName))) {
          return true;
        }

        return false;
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
      // Try to match the user's text input to one of the disambiguation options
      const userInput = message.trim().toLowerCase();
      let selectedOption: DisambiguationOption | undefined;

      // First try exact matches on display names
      for (const option of session.disambiguationOptions) {
        if (userInput === option.displayName.toLowerCase()) {
          selectedOption = option;
          break;
        }
      }

      // If no exact match, try partial matches and common variations
      if (!selectedOption) {
        for (const option of session.disambiguationOptions) {
          const displayLower = option.displayName.toLowerCase();
          const regionLower = option.region?.toLowerCase() || '';
          const countryLower = option.country.toLowerCase();

          // Check if user input contains the key parts of the location
          if (displayLower.includes(userInput) ||
              userInput.includes(regionLower) && regionLower.length > 0 ||
              userInput.includes(countryLower) ||
              userInput.includes(displayLower.split(',')[0])) { // City name match
            selectedOption = option;
            break;
          }
        }
      }

      if (selectedOption) {
        const result = await handleLocationDisambiguation(selectedOption);

        if (result.success && result.location) {
          // Get species list from MCP
          console.log(`📍 FETCHING SPECIES for location: ${result.location.displayName}`);
          const species = await speciesFetcherMCP.findSpeciesByLocation({
            latitude: result.location.lat,
            longitude: result.location.lon,
            displayName: result.location.displayName,
            city: result.location.city,
            state: result.location.state,
            country: result.location.country
          });
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
          const hasEndangeredSpecies = species.some((s: any) => s.conservationStatus &&
            ['Critically Endangered', 'Endangered', 'Vulnerable', 'Near Threatened'].includes(s.conservationStatus));

          const locationDisplayName = result.location.city || result.location.state || result.location.country || 'this location';
          let response = hasEndangeredSpecies
            ? `**Endangered & Threatened Species near ${locationDisplayName}:**\n\n`
            : `**Wildlife near ${locationDisplayName}:**\n\n`;

          species.slice(0, CONFIG.ui.maxDisplayedSpecies).forEach((animal: any) => {
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

      // Invalid selection - re-show options
      const response = `❌ **I couldn't match your response to one of the options.**\n\n${formatDisambiguationMessage(session.disambiguationOptions)}\n\n**Please copy one of the location names exactly as shown above.**`;
      return NextResponse.json({ response });
    }

    // INITIAL CLASSIFIER: Determine if input is animal or location
    if (session.step === 'initial') {
      console.log(`🔍 CLASSIFYING INPUT: "${message}"`);

      // Use AI to classify the input
      const { openai } = await import('@ai-sdk/openai');
      const { generateText } = await import('ai');

      const classificationResult = await generateText({
        model: openai('gpt-4o-mini'),
        prompt: `Classify this user input as either an ANIMAL name or a LOCATION:

Input: "${message}"

Rules:
- If it's clearly an animal species name (common or scientific), respond with: ANIMAL
- If it's a place (city, state, country, region), respond with: LOCATION
- If ambiguous, prefer ANIMAL if it contains animal-related words

Respond with ONLY one word: ANIMAL or LOCATION`,
        temperature: 0.1
      });

      const classification = classificationResult.text.trim().toUpperCase();
      console.log(`🤖 CLASSIFICATION RESULT: ${classification}`);

      if (classification === 'ANIMAL') {
        // Animal-first mode: Search for where this animal lives using MCP
        console.log(`🐾 ANIMAL-FIRST MODE: Searching for "${message}"`);

        session.mode = 'animal-first';
        session.step = 'animal-location';
        sessions.set(sessionId, session);

        // Use OpenAI web search to get basic animal info and location
        const { OpenAI } = await import('openai');
        const openaiClient = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY
        });

        console.log(`🔍 WEB SEARCH: Finding basic information for "${message}"`);

        const animalSearchResult = await openaiClient.chat.completions.create({
          model: 'gpt-4o-search-preview',
          web_search_options: {},
          messages: [
            {
              role: 'system',
              content: 'You are a wildlife expert. Search the web for current, accurate information about animal species and their habitats.'
            },
            {
              role: 'user',
              content: `Search for information about "${message}" (animal species).

Find:
1. Scientific name if available
2. Conservation status (IUCN Red List)
3. Primary geographic locations where this species is found (countries, states/provinces)
4. Current population status

Format:
Common Name: [name]
Scientific Name: [name]
Conservation Status: [status]
Found in: [list of countries/regions/states where it's commonly found - be specific]
Population: [brief note on numbers/trend]

If this is not a valid animal species, respond with: NOT_AN_ANIMAL`
            }
          ]
        });

        const animalInfo = animalSearchResult.choices[0]?.message?.content || '';
        console.log(`🔍 ANIMAL SEARCH RESULT:`, animalInfo);

        // Check if it's a valid animal
        if (animalInfo.includes('NOT_AN_ANIMAL')) {
          // Fall back to location mode
          session.mode = 'location-first';
          session.step = 'location';
          sessions.set(sessionId, session);

          const response = `🌍 **I couldn't find an animal called "${message}"**\n\nLet's try entering a location instead!\n\nPlease enter your location in one of these formats:\n\n• **City and state**: "Miami, Florida"\n• **City and country**: "Toronto, Canada"\n• **Just a city**: "Seattle"\n• **Just a state**: "California"\n• **A country**: "Canada"`;
          return NextResponse.json({ response });
        }

        // Use MCP to search for conservation organizations (worldwide/global scope)
        console.log(`🏢 MCP SEARCH: Finding organizations for "${message}"`);
        const organizations = await speciesFetcherMCP.searchConservationOrganizations(
          message,
          'Worldwide',
          process.env.OPENAI_API_KEY || ''
        );
        console.log(`🔍 FOUND ${organizations.length} organizations via MCP for ${message}`);
        console.log(`📋 MCP ORGS SAMPLE:`, JSON.stringify(organizations.slice(0, 2), null, 2));

        // Store animal information
        session.selectedAnimal = {
          id: message.toLowerCase().replace(/\s+/g, '-'),
          commonName: message,
          scientificName: 'Unknown',
          conservationStatus: 'Unknown'
        };
        sessions.set(sessionId, session);

        // Format organizations response
        let orgsResponse = '';
        if (organizations.length > 0) {
          organizations.forEach((org: any) => {
            orgsResponse += `- **${org.name}**\n`;
            if (org.website && org.website !== '#') {
              orgsResponse += `  ${org.website}\n`;
            }
            orgsResponse += `\n`;
          });
        } else {
          orgsResponse = `- Contact your local wildlife department\n- Search for international wildlife conservation organizations\n\nThese can help protect ${message}.`;
        }

        // Show the user the animal info with MCP-sourced organizations
        // Use proper capitalization for the animal name
        const capitalizedAnimal = message.split(' ').map((word: string) =>
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');

        let response = `🐾 **${capitalizedAnimal}**\n\n${animalInfo}\n\n---\n\n**${capitalizedAnimal} Conservation Organizations:**\n\n${orgsResponse}\nContact these organizations to help protect ${message}.\n\n---\n\n**Want more specific results?**\n\n1. **Enter a specific location** to find organizations in that area (e.g., "California", "Arizona", "United States")\n2. **Type "worldwide"** to search for more global organizations\n3. **Select a specific subspecies** if multiple were listed above`;

        return NextResponse.json({ response });
      } else {
        // Location-first mode (default)
        session.mode = 'location-first';
        session.step = 'location';
        sessions.set(sessionId, session);
        // Fall through to location processing
      }
    }

    // ANIMAL-FIRST MODE: Handle location selection OR refined animal name after animal is chosen
    if (session.step === 'animal-location' && session.selectedAnimal) {
      const lowerMessage = message.toLowerCase().trim();

      // Check if user is providing a more specific animal name (e.g., "Agassiz's Desert Tortoise" instead of just "desert tortoise")
      // Use AI to detect if this is a refined animal name
      const { openai } = await import('@ai-sdk/openai');
      const { generateText } = await import('ai');

      const refinementCheck = await generateText({
        model: openai('gpt-4o-mini'),
        prompt: `The user previously searched for "${session.selectedAnimal.commonName}" and we showed them subspecies/variants.

Now they responded with: "${message}"

Is this:
A) A more specific animal name/subspecies (e.g., "Agassiz's Desert Tortoise", "Morafka's Desert Tortoise")
B) A location (e.g., "California", "Florida", "worldwide")

Respond with ONLY one word: ANIMAL or LOCATION`,
        temperature: 0.1
      });

      const refinementType = refinementCheck.text.trim().toUpperCase();
      console.log(`🔍 REFINEMENT CHECK: "${message}" classified as ${refinementType}`);

      if (refinementType === 'ANIMAL') {
        // User is specifying a more specific animal - search for organizations worldwide
        console.log(`🐾 REFINED ANIMAL SEARCH: "${message}"`);

        // Update the selected animal to the more specific name
        session.selectedAnimal.commonName = message;
        sessions.set(sessionId, session);

        // Create a global location for worldwide search
        const globalLocation: Location = {
          displayName: 'Worldwide',
          country: 'Global',
          lat: 0,
          lon: 0
        };

        const organizations = await speciesFetcherMCP.searchConservationOrganizations(
          session.selectedAnimal.commonName,
          globalLocation.displayName,
          process.env.OPENAI_API_KEY || ''
        );

        let response = `**${message} Conservation Organizations:**\n\n`;
        if (organizations.length > 0) {
          organizations.forEach((org: any) => {
            response += `- **${org.name}**\n`;
            if (org.website && org.website !== '#') {
              response += `  ${org.website}\n`;
            }
            response += `\n`;
          });
          response += `Contact these organizations to help protect ${message}.`;
        } else {
          response += `No specific organizations found. Try searching online for "${message} conservation" for local and international groups.`;
        }

        session.step = 'completed';
        sessions.set(sessionId, session);

        return NextResponse.json({ response });
      }

      // Check if user wants worldwide organizations
      if (lowerMessage.includes('worldwide') || lowerMessage.includes('all location')) {
        console.log(`🌍 WORLDWIDE ORGANIZATIONS requested for ${session.selectedAnimal.commonName}`);

        // Create a fake global location
        const globalLocation: Location = {
          displayName: 'Worldwide',
          country: 'Global',
          lat: 0,
          lon: 0
        };

        const organizations = await speciesFetcherMCP.searchConservationOrganizations(
          session.selectedAnimal.commonName,
          globalLocation.displayName,
          process.env.OPENAI_API_KEY || ''
        );

        let response = `**${session.selectedAnimal.commonName} Conservation Organizations (Worldwide):**\n\n`;
        if (organizations.length > 0) {
          organizations.forEach((org: any) => {
            response += `- **${org.name}**\n`;
            if (org.website && org.website !== '#') {
              response += `  ${org.website}\n`;
            }
            response += `\n`;
          });
          response += `Contact these organizations to help protect ${session.selectedAnimal.commonName}.`;
        } else {
          response += `No specific organizations found. Try searching online for "${session.selectedAnimal.commonName} conservation" for local and international groups.`;
        }

        session.step = 'completed';
        sessions.set(sessionId, session);

        return NextResponse.json({ response });
      }

      // User provided a location - geocode it using MCP
      const geocodedLocation = await speciesFetcherMCP.geocodeLocation(message);

      if (geocodedLocation) {
        console.log(`📍 LOCATION SELECTED: ${geocodedLocation.displayName} for ${session.selectedAnimal.commonName}`);

        const organizations = await speciesFetcherMCP.searchConservationOrganizations(
          session.selectedAnimal.commonName,
          geocodedLocation.city || geocodedLocation.state || geocodedLocation.country || geocodedLocation.displayName,
          process.env.OPENAI_API_KEY || ''
        );

        let response = `**${session.selectedAnimal.commonName} Conservation Organizations in ${geocodedLocation.city || geocodedLocation.state || geocodedLocation.country}:**\n\n`;
        if (organizations.length > 0) {
          organizations.forEach((org: any) => {
            response += `- **${org.name}**\n`;
            if (org.website && org.website !== '#') {
              response += `  ${org.website}\n`;
            }
            response += `\n`;
          });
          response += `Contact these organizations to help protect ${session.selectedAnimal.commonName}.`;
        } else {
          response += `No specific organizations found in this area. Try contacting your local wildlife department or searching for "${session.selectedAnimal.commonName} conservation ${geocodedLocation.country}".`;
        }

        session.step = 'completed';
        sessions.set(sessionId, session);

        return NextResponse.json({ response });
      } else {
        const response = `🌍 **Could not understand that location.**\n\nPlease enter:\n• A specific location (e.g., "California", "Florida", "Singapore")\n• Or type "worldwide" to see all organizations for ${session.selectedAnimal.commonName}`;
        return NextResponse.json({ response });
      }
    }

    // AGENT 1: Location → Animal List (Enhanced with disambiguation)
    if (session.step === 'location') {
      // Use the new enhanced location agent
      const locationResult = await parseUserLocation(message);

      if (locationResult.success && locationResult.location) {
        // Get species list from MCP
        console.log(`📍 FETCHING SPECIES for location: ${locationResult.location.displayName}`);
        const species = await speciesFetcherMCP.findSpeciesByLocation({
          latitude: locationResult.location.lat,
          longitude: locationResult.location.lon,
          displayName: locationResult.location.displayName,
          city: locationResult.location.city,
          state: locationResult.location.state,
          country: locationResult.location.country
        });
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
        const hasEndangeredSpecies = species.some((s: any) => s.conservationStatus &&
          ['Critically Endangered', 'Endangered', 'Vulnerable', 'Near Threatened'].includes(s.conservationStatus));

        const locationDisplayName = locationResult.location.city || locationResult.location.state || locationResult.location.country || 'this location';
        let response = hasEndangeredSpecies
          ? `**🔴 Endangered & Threatened Species near ${locationDisplayName}:**\n\n`
          : `**🌿 Wildlife near ${locationDisplayName}:**\n\n`;

        species.slice(0, CONFIG.ui.maxDisplayedSpecies).forEach((animal: any) => {
          const status = animal.conservationStatus && animal.conservationStatus !== 'Unknown'
            ? ` (${animal.conservationStatus})`
            : '';
          response += `• ${animal.commonName}${status}\n`;
        });

        // Get first 3 animal names as examples
        const exampleAnimals = species.slice(0, 3).map((s: any) => s.commonName).filter(Boolean);
        const exampleText = exampleAnimals.length > 0
          ? `\n**Examples from your location:**\n${exampleAnimals.map((name: string) => `"${name}"`).join(' or ')}`
          : '';

        response += `\n\n⚠️ **IMPORTANT: You MUST select ONE animal from the list above.**\n\n📋 **Instructions:**\n1. Type the animal name EXACTLY as shown\n2. Do NOT include the conservation status (the part in parentheses)\n3. The system will then search for organizations protecting that species${exampleText}`;

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
        species.slice(0, 8).forEach((animal: any) => {
          const status = animal.conservationStatus && animal.conservationStatus !== 'Unknown'
            ? ` (${animal.conservationStatus})`
            : '';
          response += `• **${animal.commonName}**${status}\n`;
        });

        // Get first 3 animal names as examples
        const exampleAnimals = species.slice(0, 3).map((s: any) => s.commonName).filter(Boolean);
        const exampleText = exampleAnimals.length > 0
          ? `\n**Try one of these:**\n${exampleAnimals.map(name => `"${name}"`).join(' or ')}`
          : '';

        response += `\n\n⚠️ **You MUST select ONE animal from this list.**\n\n📋 **Instructions:**\n1. Type the animal name EXACTLY as shown above\n2. Do NOT include conservation status\n3. We'll find organizations protecting that species${exampleText}`;
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

      // If STILL no match, try fuzzy word-based matching (handles typos and word order)
      if (!selectedAnimal) {
        const userWords = trimmedLowerMessage.split(/\s+/).filter((w: string) => w.length > 2); // Words with 3+ chars

        for (const s of species) {
          if (!s.commonName) continue;

          const animalWords = s.commonName.toLowerCase().split(/\s+/).filter(w => w.length > 2);

          // Count how many user words match animal words (allowing slight variations)
          let matchCount = 0;
          for (const userWord of userWords) {
            for (const animalWord of animalWords) {
              // Exact word match
              if (userWord === animalWord) {
                matchCount++;
                break;
              }
              // Fuzzy match: one word contains the other (at least 4 chars)
              if (userWord.length >= 4 && animalWord.length >= 4) {
                if (userWord.includes(animalWord) || animalWord.includes(userWord)) {
                  matchCount++;
                  break;
                }
              }
              // Similar start (first 4+ characters match)
              if (userWord.length >= 4 && animalWord.length >= 4) {
                if (userWord.substring(0, 4) === animalWord.substring(0, 4)) {
                  matchCount++;
                  break;
                }
              }
            }
          }

          // If 70%+ of words match, consider it a match
          const matchRatio = matchCount / Math.max(userWords.length, animalWords.length);
          if (matchRatio >= 0.7 && matchCount >= 2) {
            selectedAnimal = s.commonName;
            matchedSpecies = s;
            console.log(`🔍 FUZZY MATCH: "${message}" matched "${s.commonName}" (${matchCount}/${Math.max(userWords.length, animalWords.length)} words, ${Math.round(matchRatio * 100)}%)`);
            break;
          }
        }
      }

      if (selectedAnimal && matchedSpecies) {
        console.log(`🏢 SEARCHING ORGANIZATIONS for ${selectedAnimal} in ${session.location?.displayName}`);
        const organizations = await speciesFetcherMCP.searchConservationOrganizations(
          matchedSpecies.commonName,
          session.location?.city || session.location?.state || session.location?.country || session.location?.displayName || 'Global',
          process.env.OPENAI_API_KEY || ''
        );
        console.log(`🔍 FOUND ${organizations.length} organizations for ${selectedAnimal}`);

        let response = `**${selectedAnimal} Conservation Organizations:**\n\n`;

        if (organizations.length > 0) {
          organizations.forEach((org: any) => {
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
          let response = `❌ **"${message}" was not found in your location's wildlife list.**\n\n`;
          response += `⚠️ **Remember: You can ONLY select animals from the list below** (found near ${session.location.city || session.location.state || session.location.country}):\n\n`;

          species.slice(0, CONFIG.ui.maxDisplayedSpecies).forEach((animal: any) => {
            const status = animal.conservationStatus && animal.conservationStatus !== 'Unknown'
              ? ` (${animal.conservationStatus})`
              : '';
            response += `• **${animal.commonName}**${status}\n`;
          });

          // Add helpful examples
          const exampleAnimals = species.slice(0, 3).map((s: any) => s.commonName).filter(Boolean);
          if (exampleAnimals.length > 0) {
            response += `\n\n💡 **Try copying one of these exactly:**\n${exampleAnimals.map(name => `"${name}"`).join(', ')}`;
          }

          response += `\n\n📝 **Tip:** Copy and paste the animal name to avoid typos!`;
          return NextResponse.json({ response });
        } else {
          const response = `❌ **No animals found for your location.**\n\nPlease start over and try a different location.`;
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
  } finally {
    // Cleanup MCP connections
    try {
      const manager = getMCPClientManager();
      await manager.disconnectAll();
    } catch (cleanupError) {
      console.error('MCP cleanup error:', cleanupError);
    }
  }
}

// Helper function to format disambiguation messages
function formatDisambiguationMessage(options: DisambiguationOption[]): string {
  let message = `🌍 **Please add more info to your location!**\n\nI found multiple places with that name:\n\n`;

  options.forEach((option, index) => {
    message += `• **${option.displayName}**\n`;
    message += `  ${option.description}\n\n`;
  });

  message += `Please respond with the **full location name** (including state/country) from the list above, or add the state/country to your original location.`;

  return message;
}