# Wildlife Finder 🌿

An AI-powered conservation app that helps users discover endangered animals in their area and find local organizations working to protect them. Built with Next.js 15, TypeScript, AI SDK 5, and real-time data APIs.

## Features

- **Two-Agent AI System**: Location analysis → Animal discovery → Organization matching
- **Location Intelligence**: Flexible location parsing (city names, full addresses, etc.)
- **Species Database**: Location-specific endangered species with fallback data for Nevada, Colorado, and more
- **Organization Search**: Real-time search for local conservation groups using Tavily API
- **Session Management**: Shared memory between conversation steps
- **Clean UI**: Modern chat interface with shadcn/ui components

## Setup

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Get API Keys:**
   - **OpenAI API Key**: Get from [OpenAI Platform](https://platform.openai.com/api-keys)
   - **Tavily API Key**: Sign up at [Tavily.com](https://tavily.com) (free tier: 1,000 searches/month)

3. **Create `.env.local` file:**
   ```bash
   OPENAI_API_KEY=your_openai_api_key_here
   TAVILY_API_KEY=your_tavily_api_key_here
   ```

4. **Start development:**
   ```bash
   pnpm dev
   ```

5. **Open [http://localhost:3000](http://localhost:3000)** to start finding wildlife!

## How to Use

### Step 1: Enter Your Location
- Type your location: `"Las Vegas"`, `"Denver, Colorado"`, or `"I live in Seattle"`
- The app supports flexible location formats

### Step 2: Browse Local Species
- Get a list of 10 endangered/protected animals in your area
- Species lists are location-specific (Nevada, Colorado, etc.)

### Step 3: Find Conservation Organizations
- Select any animal from the list
- Get real-time search results for local conservation groups
- See websites, descriptions, and contact information

### Example Conversation
```
You: Las Vegas
App: Here are endangered animals near Las Vegas:
     1. Desert Tortoise
     2. Gila Monster
     [... 8 more animals]

You: Desert Tortoise
App: Here are conservation organizations that help protect desert tortoise:
     1. Tortoise Group (Las Vegas)
     2. Desert Tortoise Council
     [... with websites and descriptions]
```

## Architecture

### Two-Agent System
- **Agent 1**: Location → Animal List (geocoding + species lookup)
- **Agent 2**: Animal Selection → Organizations (search + results)
- **Shared Memory**: Session management maintains location between steps

### APIs Used
- **OpenStreetMap Nominatim**: Free geocoding (location parsing)
- **GBIF**: Global Biodiversity Information Facility (species data)
- **Tavily**: Web search for conservation organizations
- **OpenAI GPT-4o**: Natural language processing

### Tech Stack
- **Next.js 15** - React framework with App Router
- **AI SDK 5** - AI integration toolkit
- **TypeScript** - Type-safe JavaScript
- **shadcn/ui** - Modern component library
- **Tailwind CSS v4** - Utility-first styling
- **AI Elements** - Pre-built conversation components

## Contributing

This project uses **pnpm** as the package manager. The AI agents are modular and can be extended with:
- Additional species databases (NatureServe, USFWS ECOS)
- More location-specific fallback data
- Enhanced organization search algorithms
- Multi-language support

## License

Open source - feel free to use this for conservation education and wildlife protection efforts!
