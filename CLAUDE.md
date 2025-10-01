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
- `app/page.tsx` - Main UI with three-option interface and structured input validation
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

### Initial User Interface (Three-Option Selection)
At app launch, users see three clearly structured options:

1. **Search by Animal Name**: Direct input for common or scientific animal names
   - Field: `animal_name` (string)
   - Validation: Non-empty string
   - Example: "Florida Panther", "Puma concolor coryi"

2. **Search by Location**: Structured location input with country-first validation
   - Fields:
     - `location_country` (string, required) - ISO code or full country name
     - `location_state` (string, optional) - State/province name
     - `location_city` (string, optional) - City name
   - Validation Rules:
     - Country must be entered before state/city
     - If user attempts state/city without country: Display inline error
     - Error message: "Please enter country first (e.g., US or United States)"
     - Error display: Red text directly below input field
     - User input is preserved for correction
   - Input flow: Country → State (optional) → City (optional)
   - Example: "United States" → "Florida" → "Miami"

3. **Surprise Me (Random Animal)**: No input required, random animal selection

### Validation and Error Feedback

#### Location Input Validation
- **Trigger**: User attempts to enter `location_state` or `location_city` when `location_country` is empty
- **Action**:
  - Display inline error below affected field
  - Error text color: Red (#DC2626)
  - Error background: Light red (#FEE2E2)
  - Keep user input visible
  - Disable state/city fields until country is entered
- **Error Message Format**: "⚠️ Please enter country first (e.g., US or United States)"
- **Success State**: Clear error message when country is entered

### Conversation Flow (After Mode Selection)

1. **User Input Validation**: First agent validates location inputs
2. **Wildlife Discovery**: Fetch diverse species from iNaturalist + GBIF
3. **Animal Selection**: Second agent validates animals from provided list
4. **Organization Search**: AI-powered search for relevant conservation groups
5. **Results Display**: Structured organization information with links
6. **Wildlife Information**: Third agent automatically retrieves detailed information 5 seconds after organizations

## Development Notes

### UX Design Principles
- **Immediate Feedback**: Validation errors display instantly at field level
- **Efficient Correction**: User input preserved for quick fixes
- **Guided Input**: Disabled fields prevent invalid input sequences
- **Contextual Errors**: Error messages appear directly below affected fields
- **Clear Hierarchy**: Country required before state/city inputs

### Technical Implementation
- Uses session-based conversation state management
- Implements strict guardrails to prevent invalid user inputs
- Three-option interface with mode-based state management
- Inline validation with real-time error feedback
- All API integrations include error handling and fallbacks
- UI components styled for wildlife conservation theme
- TypeScript types ensure data consistency across agents

## Credits & Attributions

- **Jim Vanas** - Original wildlife poetry examples used in RAG database
- **Looney Tunes/Warner Bros.** - Roadrunner character inspiration (used under fair use)
- **Tenor.com** - GIF hosting for roadrunner animation
- All content used for educational conservation purposes with proper attribution