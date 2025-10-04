import { NextRequest, NextResponse } from 'next/server';
import { wikipediaMCP, getMCPClientManager } from '@/lib/mcp-client';

export interface AnimalInfo {
  name: string;
  scientificName?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  description?: string;
  sourceUrl: string;
}

export async function POST(request: NextRequest) {
  try {
    const { animalName } = await request.json();

    if (!animalName) {
      return NextResponse.json({ error: 'Animal name is required' }, { status: 400 });
    }

    console.log(`📷 WIKIMEDIA API (via MCP): Fetching data for "${animalName}"`);

    // Fetch animal info from Wikipedia via MCP server
    const data = await wikipediaMCP.getSummary(animalName);

    if (!data) {
      return NextResponse.json(
        { error: 'Animal not found in Wikipedia', animalName },
        { status: 404 }
      );
    }

    // Extract scientific name from description if available
    const scientificNameMatch = data.extract?.match(/\(([A-Z][a-z]+ [a-z]+)\)/);

    const animalInfo: AnimalInfo = {
      name: data.title,
      scientificName: scientificNameMatch?.[1] || undefined,
      imageUrl: data.originalimage?.source || undefined,
      thumbnailUrl: data.thumbnail?.source || undefined,
      description: data.extract || undefined,
      sourceUrl: data.pageUrl,
    };

    console.log(`✅ WIKIMEDIA SUCCESS (via MCP): Found data for "${animalInfo.name}"`, {
      hasImage: !!animalInfo.imageUrl,
      hasThumbnail: !!animalInfo.thumbnailUrl,
    });

    return NextResponse.json({ animal: animalInfo });
  } catch (error: any) {
    console.error('❌ WIKIMEDIA ERROR (via MCP):', error.message);

    return NextResponse.json(
      { error: 'Failed to fetch animal information from Wikipedia MCP server' },
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
