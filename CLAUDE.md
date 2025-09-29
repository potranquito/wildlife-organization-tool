# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `pnpm dev` - Start development server
- `pnpm build` - Build production app
- `pnpm start` - Start production server

## Package Manager

This project strictly uses **pnpm**. Do not use npm or yarn.

## Architecture

This is a **Wildlife Organization Finder** built with Next.js 15 and AI-powered conservation features:

### Core Stack
- **Next.js 15** with App Router
- **AI SDK 5** with OpenAI GPT-4 integration
- **TypeScript** with strict type checking
- **shadcn/ui** components (New York style, green conservation theme)
- **Tailwind CSS v4** for styling

### Key Directories
- `app/` - Next.js App Router pages and API routes
- `app/api/chat/` - Three-agent AI conversation system with guardrails
- `app/api/information/` - Wildlife information retrieval using Vectorize RAG database
- `lib/conservation-tools.ts` - Wildlife data APIs and AI organization search
- `lib/agent-prompts.ts` - Agent system prompts and instructions
- `lib/wildlife-rag-service.ts` - Vectorize RAG service for wildlife population and regional data
- `components/ai-elements/` - Pre-built conversation UI components
- `components/roadrunner-loader.tsx` - Looney Tunes inspired loading animation

### Three-Agent AI System
- **Agent 1 (Location)**: Processes user location → fetches local wildlife
- **Agent 2 (Organizations)**: Validates animal selection → finds conservation groups
- **Agent 3 (Information)**: Retrieves detailed wildlife information using RAG database 5 seconds after organizations
- **Guardrails**: Strict input validation to ensure proper conversation flow
- **Session Management**: Persistent state between conversation steps

### Wildlife Data Integration
- **iNaturalist API**: Research-grade wildlife observations with real-time data (api.inaturalist.org/v1)
- **GBIF API**: Global biodiversity occurrence data with species validation (api.gbif.org/v1)
- **OpenStreetMap**: Geocoding for location processing (nominatim.openstreetmap.org)
- **Wikipedia API**: Species descriptions and images (wikipedia.org/api/rest_v1)
- **Geographic Filtering**: Country-specific species results with multi-tier validation

### AI-Powered Organization Search
- **OpenAI GPT-4**: Intelligent search for conservation organizations
- **Real-time Results**: Contextual organizations based on animal + location
- **Fallback System**: Government wildlife agencies as reliable backup

### UI Components
- **shadcn/ui** configured with:
  - New York style with green conservation theme
  - CSS variables for consistent wildlife styling
  - Import aliases: `@/components`, `@/lib/utils`, `@/components/ui`
- **AI Elements** from Vercel:
  - Conversation, Message, PromptInput components
  - Uses `UIMessage` type with `parts` array structure
  - Custom styling for wildlife conservation theme
- **Roadrunner Loader** (Looney Tunes inspired):
  - Tenor GIF iframe with "meep meep" audio
  - 5-second minimum loading time with audio timing
  - Educational animation during AI processing

### Key Files
- `app/api/chat/route.ts` - Main conversation logic with guardrails
- `app/api/information/route.ts` - Wildlife information retrieval with RAG database
- `lib/conservation-tools.ts` - Wildlife APIs and organization search
- `lib/agent-prompts.ts` - Agent system prompts (including information agent)
- `lib/wildlife-rag-service.ts` - Vectorize RAG service for wildlife data
- `app/page.tsx` - Chat interface with 3-agent flow and delayed information
- `components/roadrunner-loader.tsx` - Looney Tunes loading animation

## Environment Setup

Create `.env.local` with:
```
OPENAI_API_KEY=your_openai_api_key_here
VECTORIZE_TOKEN=your_vectorize_token_here
```

## Application Flow

1. **User Input Validation**: First agent validates location inputs
2. **Wildlife Discovery**: Fetch diverse species from iNaturalist + GBIF
3. **Animal Selection**: Second agent validates animals from provided list
4. **Organization Search**: AI-powered search for relevant conservation groups
5. **Results Display**: Structured organization information with links
6. **Wildlife Information**: Third agent automatically retrieves detailed information 5 seconds after organizations

## Development Notes

- Uses session-based conversation state management
- Implements strict guardrails to prevent invalid user inputs
- All API integrations include error handling and fallbacks
- UI components styled for wildlife conservation theme
- TypeScript types ensure data consistency across agents

## Credits & Attributions

- **Jim Vanas** - Original wildlife poetry examples used in RAG database
- **Looney Tunes/Warner Bros.** - Roadrunner character inspiration (used under fair use)
- **Tenor.com** - GIF hosting for roadrunner animation
- All content used for educational conservation purposes with proper attribution