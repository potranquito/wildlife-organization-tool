import { NextRequest, NextResponse } from 'next/server';
import { WILDLIFE_INFORMATION_AGENT_PROMPT } from '@/lib/agent-prompts';
import {
  searchWildlifeInformation,
  extractKeyInformation,
  type RAGResponse
} from '@/lib/wildlife-rag-service';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    // Check for required environment variables
    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ OPENAI_API_KEY environment variable is not set');
      return NextResponse.json({
        response: '⚠️ **Information Service Configuration Error**\n\nThe wildlife information service is currently unavailable due to a configuration issue. Please try again later or contact support if the problem persists.'
      });
    }

    if (!process.env.VECTORIZE_TOKEN) {
      console.error('❌ VECTORIZE_TOKEN environment variable is not set');
      return NextResponse.json({
        response: '⚠️ **RAG Database Unavailable**\n\nThe wildlife information database is currently unavailable. Please try again later or ask general questions about wildlife conservation.'
      });
    }

    const { animal, location } = await request.json();

    console.log(`📊 INFORMATION API TRIGGERED for animal: ${animal}, location: ${location || 'none'}`);

    if (!animal) {
      return NextResponse.json({ error: 'Animal name is required' }, { status: 400 });
    }

    console.log(`Retrieving information for: ${animal}${location ? ` in ${location}` : ''}`);

    // First, search the RAG database for wildlife information
    const ragResponse: RAGResponse = await searchWildlifeInformation(animal, location);

    if (!ragResponse.success) {
      if (ragResponse.needsMoreInfo) {
        // Ask user for more information
        const response = `🤔 **Need More Information About ${animal}**\n\n${ragResponse.error}\n\nTo provide better information, could you tell me more about:\n- **Specific habitat** you're interested in\n- **Particular behaviors** you want to learn about\n- **Conservation concerns** in your area\n- **Regional population** questions\n\nThis will help me find more relevant information!`;
        return NextResponse.json({ response });
      } else {
        // RAG service error - fall back to general response
        console.log(`⚠️ RAG SERVICE ERROR: ${ragResponse.error}`);
        const response = `⚠️ **Information Service Temporarily Limited**\n\nI'm having trouble accessing detailed information about ${animal} right now. This could be due to:\n\n- **Database connectivity issues**\n- **High server load**\n- **Service maintenance**\n\nPlease try again in a few minutes, or feel free to ask specific questions about ${animal}'s habitat, behavior, or conservation status.`;
        return NextResponse.json({ response });
      }
    }

    // If we have RAG data, process it with AI
    if (ragResponse.documents && ragResponse.documents.length > 0) {
      console.log(`🤖 OPENAI INFORMATION SYNTHESIS STARTED for: ${animal}`);

      // Extract structured information from RAG documents
      const structuredInfo = extractKeyInformation(ragResponse.documents);

      // Combine RAG documents into context
      const ragContext = ragResponse.documents
        .map((doc, index) => `Document ${index + 1}:\n${doc.text}`)
        .join('\n\n');

      const prompt = `${WILDLIFE_INFORMATION_AGENT_PROMPT}

**RAG Database Context:**
${ragContext}

**Structured Information Extracted:**
- Key Facts: ${structuredInfo.facts.join(' | ')}
- Habitats: ${structuredInfo.habitats.join(' | ')}
- Population Data: ${structuredInfo.populations.join(' | ')}
- Conservation Info: ${structuredInfo.conservation.join(' | ')}
- Regional Info: ${structuredInfo.regions.join(' | ')}

**Your Task:**
Create a comprehensive information response about "${animal}"${location ? ` in the context of ${location}` : ''} using the RAG database information above. Follow the specified response structure and make the information educational and engaging.`;

      // Import OpenAI and generateText dynamically
      const { openai } = await import('@ai-sdk/openai');
      const { generateText } = await import('ai');

      console.log(`🌐 CALLING OpenAI GPT-4o for information synthesis...`);

      const result = await generateText({
        model: openai('gpt-4o'),
        prompt: prompt,
        temperature: 0.3, // Lower temperature for more factual responses
      });

      const informationResponse = result.text.trim();
      console.log(`✅ OPENAI INFORMATION SUCCESS: Generated ${informationResponse.length} character response for ${animal}`);

      return NextResponse.json({ response: informationResponse });
    }

    // Fallback if no documents found but no specific error
    const response = `📚 **Limited Information Available for ${animal}**\n\nI couldn't find specific details about ${animal} in my current database. This might be because:\n\n- **Specific species name** may need clarification\n- **Regional data** might be limited\n- **Database coverage** for this species is incomplete\n\nCould you provide more details about:\n- **Scientific name** if known\n- **Specific region** you're interested in\n- **Particular aspects** (habitat, behavior, conservation)\n\nThis will help me provide better information!`;

    return NextResponse.json({ response });

  } catch (error) {
    console.error('Information API error:', error);

    // Provide a helpful error message
    const response = `🔧 **Information Service Temporarily Unavailable**\n\nI encountered a technical issue while retrieving information. This might be due to:\n\n- **Service connectivity** problems\n- **High traffic** volume\n- **Temporary database** issues\n\nPlease try again in a moment. If the problem persists, you can still ask general questions about wildlife conservation!`;

    return NextResponse.json({ response });
  }
}