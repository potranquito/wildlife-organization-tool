import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

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

    console.log(`📷 WIKIMEDIA API: Fetching data for "${animalName}"`);

    // Fetch animal info from Wikipedia REST API
    const response = await axios.get(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(animalName)}`,
      {
        headers: {
          'User-Agent': 'Wildlife-Extinction-Timer/1.0 (Educational Conservation Tool)',
        },
      }
    );

    const data = response.data;

    // Extract scientific name from description if available
    const scientificNameMatch = data.extract?.match(/\(([A-Z][a-z]+ [a-z]+)\)/);

    const animalInfo: AnimalInfo = {
      name: data.title,
      scientificName: scientificNameMatch?.[1] || undefined,
      imageUrl: data.originalimage?.source || undefined,
      thumbnailUrl: data.thumbnail?.source || undefined,
      description: data.extract || undefined,
      sourceUrl: data.content_urls.desktop.page,
    };

    console.log(`✅ WIKIMEDIA SUCCESS: Found data for "${animalInfo.name}"`, {
      hasImage: !!animalInfo.imageUrl,
      hasThumbnail: !!animalInfo.thumbnailUrl,
    });

    return NextResponse.json({ animal: animalInfo });
  } catch (error: any) {
    console.error('❌ WIKIMEDIA ERROR:', error.message);

    if (error.response?.status === 404) {
      return NextResponse.json(
        { error: 'Animal not found in Wikipedia', animalName: request.body },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch animal information from Wikimedia' },
      { status: 500 }
    );
  }
}
