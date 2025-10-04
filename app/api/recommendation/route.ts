import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(request: NextRequest) {
  try {
    const { animal, conversationContext } = await request.json();

    console.log(`🤔 RECOMMENDATION API TRIGGERED for: ${animal}`);

    if (!animal) {
      return NextResponse.json({ error: 'Animal name is required' }, { status: 400 });
    }

    // Use AI to analyze the conversation and make a recommendation
    const result = await generateText({
      model: openai('gpt-4o'),
      prompt: `You are a wildlife conservation expert providing final verdicts on whether species need urgent help.

**Species:** ${animal}

**Available Information:**
${conversationContext || 'No additional context provided'}

**Your Task:**
Carefully analyze ALL available information about this species, including:
- Current IUCN Red List conservation status
- Population numbers and trends (declining, stable, or increasing)
- Geographic range and habitat threats
- Human impacts (poaching, habitat loss, climate change, pollution)
- Existing conservation programs and their effectiveness
- Recent conservation successes or failures

**Decision Framework:**
- **URGENT HELP NEEDED**: Critically Endangered, Endangered, or rapid population decline
- **HELP RECOMMENDED**: Vulnerable, Near Threatened, or declining populations
- **STABLE - MONITOR**: Least Concern with stable/increasing populations, but still worth supporting
- **THRIVING**: Species has recovered significantly and needs minimal intervention

**Output Format:**
**Verdict: [Your determination]**

[2-3 sentences explaining your reasoning based on SPECIFIC facts from the information above. Reference actual population numbers, conservation status, or threats when available. Make each verdict unique to the species.]

**Important:** Base your verdict on the ACTUAL information provided, not general knowledge. Each species should receive a thoughtful, data-driven assessment.`,
      temperature: 0.7
    });

    const recommendation = result.text;
    console.log(`✅ RECOMMENDATION GENERATED for ${animal}`);

    return NextResponse.json({ recommendation });
  } catch (error) {
    console.error('Recommendation API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate recommendation' },
      { status: 500 }
    );
  }
}
