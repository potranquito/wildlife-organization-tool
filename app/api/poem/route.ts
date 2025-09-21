import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { NextRequest, NextResponse } from 'next/server';
import { WILDLIFE_POETRY_AGENT_PROMPT } from '@/lib/agent-prompts';
import { findPoemByAnimal, getRandomPoem } from '@/lib/animal-poems-rag';

export async function POST(request: NextRequest) {
  try {
    // Check for OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY environment variable is not set');
      return NextResponse.json({
        error: 'Service temporarily unavailable. Please try again later.'
      }, { status: 503 });
    }

    const { animal } = await request.json();

    if (!animal) {
      return NextResponse.json({ error: 'Animal name is required' }, { status: 400 });
    }

    console.log(`Generating poem for: ${animal}`);

    // First, check if we have a pre-written poem in our RAG database
    const existingPoem = findPoemByAnimal(animal);

    if (existingPoem) {
      console.log(`Found existing poem for ${animal}`);
      const response = `🐾 **A Poem About the ${animal}**\n\n${existingPoem}`;
      return NextResponse.json({ response });
    }

    // If no existing poem, generate one using AI with RAG examples
    console.log(`Generating new poem for ${animal}`);

    // Get a few example poems for context
    const randomExample = getRandomPoem();

    const prompt = `${WILDLIFE_POETRY_AGENT_PROMPT}

**Example Poem Style (for reference):**
Animal: ${randomExample.animal}
${randomExample.poem}

**Your Task:**
Write a poem about the ${animal} following the same style, structure, and educational approach as the example above. Focus on interesting facts about the ${animal} that might surprise readers.`;

    const result = await generateText({
      model: openai('gpt-4o'),
      prompt: prompt,
      temperature: 0.7,
    });

    const poemResponse = result.text.trim();
    console.log(`Generated poem for ${animal}: ${poemResponse}`);

    return NextResponse.json({ response: poemResponse });

  } catch (error) {
    console.error('Poetry API error:', error);
    
    // Fallback: Return a random poem from our RAG database
    try {
      const fallbackPoem = getRandomPoem();
      const response = `🐾 **A Poem About the ${fallbackPoem.animal}**\n\n${fallbackPoem.poem}`;
      return NextResponse.json({ response });
    } catch (fallbackError) {
      console.error('Fallback poem error:', fallbackError);
      return NextResponse.json(
        { error: 'Failed to generate poem' },
        { status: 500 }
      );
    }
  }
}