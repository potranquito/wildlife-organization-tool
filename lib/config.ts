// Configuration for Wildlife Finder
// All hardcoded values should be defined here

export const CONFIG = {
  // Timing configurations
  timing: {
    minLoadingTime: Number(process.env.MIN_LOADING_TIME) || 5000, // 5 seconds
    poemDelay: Number(process.env.POEM_DELAY) || 5000, // 5 seconds after organizations
  },

  // UI/UX configurations
  ui: {
    maxDisplayedSpecies: Number(process.env.MAX_DISPLAYED_SPECIES) || 8,
    maxDisplayedOrganizations: Number(process.env.MAX_DISPLAYED_ORGANIZATIONS) || 5,
  },

  // Input validation limits
  validation: {
    minLocationLength: Number(process.env.MIN_LOCATION_LENGTH) || 2,
    maxLocationLength: Number(process.env.MAX_LOCATION_LENGTH) || 50,
    maxVeryLongMessage: Number(process.env.MAX_VERY_LONG_MESSAGE) || 100,
    minAnimalNameLength: Number(process.env.MIN_ANIMAL_NAME_LENGTH) || 3,
  },

  // Geographic data
  locations: {
    countries: [
      'united states', 'usa', 'canada', 'mexico', 'united kingdom', 'uk',
      'australia', 'brazil', 'germany', 'france', 'spain', 'italy', 'japan',
      'china', 'india', 'nepal', 'bangladesh', 'pakistan', 'afghanistan',
      'thailand', 'vietnam', 'cambodia', 'laos', 'myanmar', 'malaysia',
      'singapore', 'indonesia', 'philippines', 'south korea', 'north korea',
      'mongolia', 'russia', 'turkey', 'egypt', 'nigeria', 'kenya', 'ethiopia',
      'ghana', 'morocco', 'algeria', 'tunisia', 'israel', 'saudi arabia',
      'uae', 'iran', 'iraq', 'south africa', 'argentina', 'chile', 'colombia',
      'peru', 'venezuela', 'ecuador', 'bolivia', 'paraguay', 'uruguay',
      'netherlands', 'belgium', 'switzerland', 'austria', 'poland', 'czech republic',
      'hungary', 'romania', 'bulgaria', 'croatia', 'serbia', 'greece', 'sweden',
      'norway', 'denmark', 'finland'
    ],

    usStates: [
      'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado',
      'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho',
      'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana',
      'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota',
      'mississippi', 'missouri', 'montana', 'nebraska', 'nevada',
      'new hampshire', 'new jersey', 'new mexico', 'new york', 'north carolina',
      'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania',
      'rhode island', 'south carolina', 'south dakota', 'tennessee',
      'texas', 'utah', 'vermont', 'virginia', 'washington', 'west virginia',
      'wisconsin', 'wyoming'
    ],

    canadianProvinces: [
      'alberta', 'british columbia', 'manitoba', 'new brunswick',
      'newfoundland and labrador', 'northwest territories', 'nova scotia',
      'nunavut', 'ontario', 'prince edward island', 'quebec', 'saskatchewan',
      'yukon', 'yukon territory'
    ]
  },

  // Common animal names for validation
  animals: {
    commonNames: [
      'eagle', 'bear', 'wolf', 'deer', 'fox', 'owl', 'hawk', 'salmon',
      'turtle', 'frog', 'bat', 'snake', 'lizard', 'butterfly', 'crane',
      'duck', 'rabbit', 'squirrel', 'mouse', 'rat', 'cat', 'lynx', 'otter',
      'seal', 'whale', 'dolphin', 'bird', 'mammal', 'reptile', 'amphibian',
      'fish', 'skunk', 'raccoon', 'beaver', 'chipmunk', 'vole', 'shrew',
      'mole', 'weasel', 'marten', 'fisher', 'badger', 'porcupine', 'woodchuck',
      'muskrat', 'opossum', 'moose', 'elk', 'caribou', 'bison', 'sheep',
      'goat', 'pika', 'hare', 'bobcat', 'cougar', 'coyote', 'wolverine',
      'walrus', 'manatee', 'dugong'
    ],

    // Common words that shouldn't match as animals
    excludedWords: [
      'hello', 'help', 'animal', 'wildlife', 'species', 'conservation',
      'organization', 'find', 'search', 'show', 'list', 'bird', 'fish',
      'small', 'large', 'white', 'black', 'brown', 'red', 'blue', 'green'
    ],

    // Descriptive prefixes for animals
    descriptivePrefixes: [
      'striped', 'spotted', 'common', 'american', 'european', 'eastern',
      'western', 'northern', 'southern', 'red', 'black', 'white', 'brown',
      'gray', 'grey', 'blue', 'green', 'yellow', 'great', 'little', 'small',
      'large', 'giant'
    ]
  },

  // Input patterns for validation
  patterns: {
    nonLocationInputs: [
      /^(hello|hi|hey|howdy|greetings|good morning|good afternoon|good evening)/i,
      /^(what|who|when|how|why|where)/i,
      /^(help|support|info|information|about|contact|assistance)/i,
      /^(yes|no|ok|okay|sure|thanks|thank you|please|welcome)/i,
      /^(animal|wildlife|species|conservation|organization|find|search|show|list|tell|give)/i,
      /^(cool|nice|awesome|great|wow|amazing|interesting)/i,
      /^(sorry|excuse me|pardon)/i,
      /^[0-9]+$/, // Just numbers
      /^.{1,2}$/, // Very short inputs (1-2 characters)
    ],

    nonAnimalInputs: [
      /^(hello|hi|hey|howdy|greetings|good morning|good afternoon|good evening)/i,
      /^(what|who|when|how|why|where)/i,
      /^(help|support|info|information|about|contact|assistance)/i,
      /^(yes|no|ok|okay|sure|thanks|thank you|please|welcome)/i,
      /^(location|where|place|city|state|country|address)/i,
      /^(find|search|show|list|give|tell|get|display)/i,
      /^(cool|nice|awesome|great|wow|amazing|interesting)/i,
      /^(sorry|excuse me|pardon)/i,
      /^(back|go back|return|restart|start over)/i,
      /^[0-9]+$/, // Just numbers
      /^.{1,2}$/, // Very short inputs (1-2 characters)
    ],

    locationIndicators: [
      /(?:i\s+(?:am|live)\s+in|in|near|around|at|from)\s+/i,
      /^([A-Za-z]+(?:\s+[A-Za-z]+)*),\s*([A-Za-z]+(?:\s+[A-Za-z]+)*)/i,
    ]
  }
};

// Helper functions for dynamic pattern generation
export function createCountryPattern(): RegExp {
  const countries = CONFIG.locations.countries.join('|');
  return new RegExp(`^(${countries})$`, 'i');
}

export function createStatePattern(): RegExp {
  const states = CONFIG.locations.usStates.join('|');
  return new RegExp(`^(${states})$`, 'i');
}

export function createProvincePattern(): RegExp {
  const provinces = CONFIG.locations.canadianProvinces.join('|');
  return new RegExp(`^(${provinces})$`, 'i');
}

export function createAnimalPattern(): RegExp {
  const animals = CONFIG.animals.commonNames.join('|');
  return new RegExp(`^(${animals})$`, 'i');
}

export function createAnimalDescriptivePattern(): RegExp {
  const prefixes = CONFIG.animals.descriptivePrefixes.join('|');
  const animals = CONFIG.animals.commonNames.join('|');
  return new RegExp(`\\b(${prefixes})\\s+(${animals})\\b`, 'i');
}

// Environment validation
export function validateConfig() {
  const errors: string[] = [];

  if (CONFIG.timing.minLoadingTime < 1000) {
    errors.push('MIN_LOADING_TIME should be at least 1000ms');
  }

  if (CONFIG.timing.poemDelay < 1000) {
    errors.push('POEM_DELAY should be at least 1000ms');
  }

  if (CONFIG.ui.maxDisplayedSpecies < 1) {
    errors.push('MAX_DISPLAYED_SPECIES should be at least 1');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }

  return true;
}