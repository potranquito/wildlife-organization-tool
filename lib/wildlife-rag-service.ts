// Wildlife RAG Information Service
// Retrieves wildlife population and regional data from Vectorize RAG database

import { Configuration, PipelinesApi } from '@vectorize-io/vectorize-client';

// Vectorize configuration
const VECTORIZE_CONFIG = {
  organization: 'e8629f67-070c-45d3-9bf1-2375b2882b06',
  pipeline: 'aip91ddc-865e-4609-a238-375040b5565b',
  endpoint: 'https://api.vectorize.io/v1'
};

// Types for RAG responses
export interface RAGDocument {
  text: string;
  metadata?: {
    source?: string;
    unique_source?: string;
    origin?: string;
    [key: string]: any;
  };
  score?: number;
}

export interface RAGResponse {
  success: boolean;
  documents?: RAGDocument[];
  error?: string;
  needsMoreInfo?: boolean;
}

// Initialize Vectorize client
function createVectorizeClient() {
  const token = process.env.VECTORIZE_TOKEN;

  if (!token) {
    throw new Error('VECTORIZE_TOKEN environment variable is required');
  }

  const config = new Configuration({
    accessToken: token,
    basePath: VECTORIZE_CONFIG.endpoint,
  });

  return new PipelinesApi(config);
}

// Search for wildlife information in the RAG database
export async function searchWildlifeInformation(
  animalName: string,
  location?: string,
  numResults: number = 5
): Promise<RAGResponse> {
  try {
    const client = createVectorizeClient();

    // Construct search query with both animal and location if available
    let searchQuery = animalName;
    if (location) {
      searchQuery += ` ${location} population habitat range distribution`;
    } else {
      searchQuery += ` population habitat characteristics behavior conservation`;
    }

    console.log(`🔍 RAG SEARCH: Querying for "${searchQuery}"`);

    const response = await client.retrieveDocuments({
      organizationId: VECTORIZE_CONFIG.organization,
      pipelineId: VECTORIZE_CONFIG.pipeline,
      retrieveDocumentsRequest: {
        question: searchQuery,
        numResults: numResults,
      }
    });

    console.log(`📄 RAG RESPONSE: Found ${response.documents?.length || 0} documents`);

    if (!response.documents || response.documents.length === 0) {
      return {
        success: false,
        needsMoreInfo: true,
        error: `No specific information found for ${animalName}${location ? ` in ${location}` : ''}`
      };
    }

    // Filter and score documents for relevance
    const relevantDocuments = response.documents
      .filter(doc => doc.text && doc.text.length > 50) // Filter out very short fragments
      .map(doc => ({
        text: doc.text,
        metadata: doc.metadata,
        score: calculateRelevanceScore(doc.text, animalName, location)
      }))
      .sort((a, b) => b.score - a.score); // Sort by relevance score

    // Check if we have good quality matches
    const hasHighQualityMatch = relevantDocuments.some(doc => doc.score > 0.3);

    if (!hasHighQualityMatch) {
      return {
        success: false,
        needsMoreInfo: true,
        error: `Found general information but no specific details about ${animalName}${location ? ` in ${location}` : ''}. Please provide more specific information about the animal's habitat, behavior, or conservation status.`
      };
    }

    return {
      success: true,
      documents: relevantDocuments.slice(0, 3) // Return top 3 most relevant
    };

  } catch (error) {
    console.error('RAG Service Error:', error);

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('VECTORIZE_TOKEN')) {
        return {
          success: false,
          error: 'RAG service configuration error. Please check environment variables.'
        };
      }
      if (error.message.includes('network') || error.message.includes('fetch')) {
        return {
          success: false,
          error: 'Unable to connect to information database. Please try again later.'
        };
      }
    }

    return {
      success: false,
      error: 'Information retrieval service temporarily unavailable'
    };
  }
}

// Calculate relevance score for a document
function calculateRelevanceScore(text: string, animalName: string, location?: string): number {
  const textLower = text.toLowerCase();
  const animalLower = animalName.toLowerCase();
  const locationLower = location?.toLowerCase() || '';

  let score = 0;

  // Direct animal name match (highest weight)
  if (textLower.includes(animalLower)) {
    score += 0.5;

    // Bonus for exact species name match
    if (textLower.includes(animalLower.replace(/\s+/g, ' '))) {
      score += 0.2;
    }
  }

  // Animal keywords and variations
  const animalWords = animalLower.split(' ');
  animalWords.forEach(word => {
    if (word.length > 3 && textLower.includes(word)) {
      score += 0.1;
    }
  });

  // Location match if provided
  if (location && locationLower) {
    if (textLower.includes(locationLower)) {
      score += 0.3;
    }

    // Check for regional terms
    const locationWords = locationLower.split(' ');
    locationWords.forEach(word => {
      if (word.length > 3 && textLower.includes(word)) {
        score += 0.1;
      }
    });
  }

  // Wildlife and conservation keywords
  const wildlifeKeywords = [
    'population', 'habitat', 'distribution', 'range', 'conservation',
    'endangered', 'threatened', 'species', 'wildlife', 'behavior',
    'migration', 'breeding', 'nesting', 'feeding', 'ecosystem'
  ];

  wildlifeKeywords.forEach(keyword => {
    if (textLower.includes(keyword)) {
      score += 0.05;
    }
  });

  // Length penalty for very short or very long texts
  if (text.length < 100) {
    score *= 0.8;
  } else if (text.length > 2000) {
    score *= 0.9;
  }

  return Math.min(score, 1.0); // Cap at 1.0
}

// Extract key information from RAG documents
export function extractKeyInformation(documents: RAGDocument[]): {
  facts: string[];
  habitats: string[];
  populations: string[];
  conservation: string[];
  regions: string[];
} {
  const facts: string[] = [];
  const habitats: string[] = [];
  const populations: string[] = [];
  const conservation: string[] = [];
  const regions: string[] = [];

  documents.forEach(doc => {
    const text = doc.text;
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);

    sentences.forEach(sentence => {
      const lower = sentence.toLowerCase();

      // Categorize information based on keywords
      if (lower.includes('habitat') || lower.includes('live') || lower.includes('found in')) {
        habitats.push(sentence.trim());
      } else if (lower.includes('population') || lower.includes('number') || lower.includes('count')) {
        populations.push(sentence.trim());
      } else if (lower.includes('conservation') || lower.includes('endangered') || lower.includes('threatened') || lower.includes('protect')) {
        conservation.push(sentence.trim());
      } else if (lower.includes('region') || lower.includes('area') || lower.includes('state') || lower.includes('country')) {
        regions.push(sentence.trim());
      } else {
        facts.push(sentence.trim());
      }
    });
  });

  return {
    facts: facts.slice(0, 3),
    habitats: habitats.slice(0, 2),
    populations: populations.slice(0, 2),
    conservation: conservation.slice(0, 2),
    regions: regions.slice(0, 2)
  };
}