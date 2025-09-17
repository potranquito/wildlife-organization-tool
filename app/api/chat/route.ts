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

// Simple in-memory session storage (in production, use Redis or database)
const sessions = new Map<string, { location?: Location, step: 'location' | 'animal' }>();

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
      // Check if user provided a location - much more flexible parsing
      let locationQuery: string | null = null;

      // Pattern 1: "I am in Las Vegas" or "I live in Denver"
      const locationPattern1 = message.match(/(?:i\s+(?:am|live)\s+in|in|near|around|at|from)\s+([^.!?]+)/i);
      if (locationPattern1) {
        locationQuery = locationPattern1[1].trim();
      }

      // Pattern 2: City, State format (e.g., "Las Vegas, Nevada")
      if (!locationQuery) {
        const cityStateMatch = message.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s*([A-Z][a-z]+)/);
        if (cityStateMatch) {
          locationQuery = `${cityStateMatch[1]}, ${cityStateMatch[2]}`;
        }
      }

      // Pattern 3: Just a city name (if it looks like a proper place name) - case insensitive
      if (!locationQuery) {
        const cityMatch = message.match(/^([A-Za-z]+(?:\s+[A-Za-z]+)*)$/);
        if (cityMatch && cityMatch[1].length > 2) {
          locationQuery = cityMatch[1];
        }
      }

      // Pattern 4: Simple word that could be a city (fallback) - handles lowercase inputs
      if (!locationQuery && message.trim().length < 50 && /^[A-Za-z\s,]+$/.test(message.trim())) {
        locationQuery = message.trim();
      }

      if (locationQuery) {
        const location = await geocodeLocation(locationQuery);

        if (location) {
          // Save location to session and move to next step
          session.location = location;
          session.step = 'animal';
          sessions.set(sessionId, session);

          // Get species list
          let species = await findSpeciesByLocation(location);

          // Fallback to location-specific endangered species if API returns empty
          if (species.length === 0) {
            const state = location.state?.toLowerCase();

            if (state?.includes('nevada') || location.displayName.toLowerCase().includes('las vegas')) {
              species = [
                { id: '1', commonName: 'Desert Tortoise', scientificName: '', conservationStatus: '', description: '' },
                { id: '2', commonName: 'Southwestern Willow Flycatcher', scientificName: '', conservationStatus: '', description: '' },
                { id: '3', commonName: 'Pahrump Poolfish', scientificName: '', conservationStatus: '', description: '' },
                { id: '4', commonName: 'Devils Hole Pupfish', scientificName: '', conservationStatus: '', description: '' },
                { id: '5', commonName: 'Relict Leopard Frog', scientificName: '', conservationStatus: '', description: '' },
                { id: '6', commonName: 'Big Brown Bat', scientificName: '', conservationStatus: '', description: '' },
                { id: '7', commonName: 'Gila Monster', scientificName: '', conservationStatus: '', description: '' },
                { id: '8', commonName: 'Burrowing Owl', scientificName: '', conservationStatus: '', description: '' },
                { id: '9', commonName: 'Mountain Sheep', scientificName: '', conservationStatus: '', description: '' },
                { id: '10', commonName: 'Kit Fox', scientificName: '', conservationStatus: '', description: '' }
              ];
            } else if (state?.includes('colorado')) {
              species = [
                { id: '1', commonName: 'Black-footed Ferret', scientificName: '', conservationStatus: '', description: '' },
                { id: '2', commonName: 'Lynx', scientificName: '', conservationStatus: '', description: '' },
                { id: '3', commonName: 'Greenback Cutthroat Trout', scientificName: '', conservationStatus: '', description: '' },
                { id: '4', commonName: 'Prebles Meadow Jumping Mouse', scientificName: '', conservationStatus: '', description: '' },
                { id: '5', commonName: 'Piping Plover', scientificName: '', conservationStatus: '', description: '' },
                { id: '6', commonName: 'Boreal Toad', scientificName: '', conservationStatus: '', description: '' },
                { id: '7', commonName: 'River Otter', scientificName: '', conservationStatus: '', description: '' },
                { id: '8', commonName: 'Peregrine Falcon', scientificName: '', conservationStatus: '', description: '' },
                { id: '9', commonName: 'Bighorn Sheep', scientificName: '', conservationStatus: '', description: '' },
                { id: '10', commonName: 'White-tailed Ptarmigan', scientificName: '', conservationStatus: '', description: '' }
              ];
            } else {
              // Default species list
              species = [
                { id: '1', commonName: 'Bald Eagle', scientificName: '', conservationStatus: '', description: '' },
                { id: '2', commonName: 'Gray Wolf', scientificName: '', conservationStatus: '', description: '' },
                { id: '3', commonName: 'Brown Bear', scientificName: '', conservationStatus: '', description: '' },
                { id: '4', commonName: 'Whooping Crane', scientificName: '', conservationStatus: '', description: '' },
                { id: '5', commonName: 'California Condor', scientificName: '', conservationStatus: '', description: '' },
                { id: '6', commonName: 'Sea Turtle', scientificName: '', conservationStatus: '', description: '' },
                { id: '7', commonName: 'Monarch Butterfly', scientificName: '', conservationStatus: '', description: '' },
                { id: '8', commonName: 'Polar Bear', scientificName: '', conservationStatus: '', description: '' },
                { id: '9', commonName: 'Mountain Lion', scientificName: '', conservationStatus: '', description: '' },
                { id: '10', commonName: 'Black Bear', scientificName: '', conservationStatus: '', description: '' }
              ];
            }
          }

          let response = `Here are endangered and protected animals near ${location.displayName}:\n\n`;

          species.slice(0, 10).forEach((animal, index) => {
            response += `${index + 1}. ${animal.commonName}\n`;
          });

          response += `\nSelect an animal to learn about conservation organizations.`;

          return NextResponse.json({ response });
        }
      }

      // Ask for location if not provided
      const response = `📍 **Where are you located?** \nPlease tell me your city and state (e.g., "Las Vegas" or "Denver, Colorado").`;
      return NextResponse.json({ response });
    }

    // AGENT 2: Animal Selection → Organizations
    if (session.step === 'animal' && session.location) {
      // Check if user selected an animal
      const animalNames = [
        'desert tortoise', 'southwestern willow flycatcher', 'pahrump poolfish', 'devils hole pupfish', 'relict leopard frog', 'big brown bat', 'gila monster', 'burrowing owl', 'mountain sheep', 'kit fox',
        'black-footed ferret', 'lynx', 'greenback cutthroat trout', 'prebles meadow jumping mouse', 'piping plover', 'boreal toad', 'river otter', 'peregrine falcon', 'bighorn sheep', 'white-tailed ptarmigan',
        'bald eagle', 'gray wolf', 'brown bear', 'whooping crane', 'california condor', 'sea turtle', 'monarch butterfly', 'polar bear', 'mountain lion', 'black bear'
      ];

      const selectedAnimal = animalNames.find(animal => lowerMessage.includes(animal.toLowerCase()));

      if (selectedAnimal) {
        const species = { commonName: selectedAnimal, scientificName: '', conservationStatus: '' };
        const organizations = await findConservationOrganizations(species as Species, session.location);

        let response = `Here are conservation organizations near ${session.location.displayName} that help protect ${selectedAnimal}:\n\n`;

        if (organizations.length > 0) {
          organizations.forEach((org, index) => {
            response += `${index + 1}. **${org.name}**\n`;
            if (org.website) {
              response += `   Website: ${org.website}\n`;
            }
            response += `   ${org.description}\n\n`;
          });
          response += `You can contact these organizations to volunteer, donate, or learn more about how to help protect ${selectedAnimal}!`;
        } else {
          response += `I couldn't find specific organizations, but you can search for local wildlife conservation groups or contact your state wildlife department for ways to help protect ${selectedAnimal}.`;
        }

        // Reset session for new conversation
        session.step = 'location';
        delete session.location;
        sessions.set(sessionId, session);

        return NextResponse.json({ response });
      } else {
        // Animal not recognized, ask again
        const response = `Please select an animal from the list I provided, or type the name of any animal you're interested in.`;
        return NextResponse.json({ response });
      }
    }

    // Fallback
    const response = `📍 **Where are you located?** \nPlease tell me your city and state to get started.`;
    return NextResponse.json({ response });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    );
  }
}