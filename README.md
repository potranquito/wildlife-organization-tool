# Wildlife Organization Finder 🌿🦅

An AI-powered conservation application that helps users discover wildlife in their area and connect with organizations working to protect them. Built with Next.js 15, TypeScript, AI SDK 5, and comprehensive wildlife data APIs.

## 🌟 Features

- **🤖 Intelligent Three-Agent AI System**: Guided conversation flow with smart guardrails and educational poetry
- **🌍 Smart Location Intelligence**: Supports cities, states, countries, and flexible input formats
- **🔍 AI-Powered Organization Search**: Real-time search using OpenAI GPT-4 for relevant conservation groups
- **🐾 Comprehensive Wildlife Database**: Live species data from iNaturalist and GBIF APIs
- **🛡️ Robust Guardrails**: Input validation ensures users follow the proper conversation flow
- **💬 Session Management**: Consistent experience with persistent conversation state
- **🎨 Nature-Themed UI**: Modern chat interface with Looney Tunes roadrunner loading animation
- **📖 Educational Poetry**: RAG-powered wildlife poems with 5-second delayed delivery

## 🚀 How It Works

### Step 1: Enter Your Location 🌍
- **Supported formats**: `"Seattle"`, `"California"`, `"Las Vegas, Nevada"`, `"Canada"`
- **Smart validation**: Rejects non-location inputs with helpful guidance
- **Global support**: Works with international locations via OpenStreetMap geocoding

### Step 2: Discover Local Wildlife 🐾
- **Live data**: Real-time species observations from iNaturalist and GBIF
- **Taxonomic diversity**: Balanced selection of mammals, birds, reptiles, and amphibians
- **Location-specific**: Results tailored to your exact geographic region
- **Conservation status**: Shows endangered and threatened species when available

### Step 3: Find Conservation Organizations 🏛️
- **AI-powered search**: GPT-4 finds relevant organizations using web knowledge
- **Strict validation**: Only accepts animals from your location's species list
- **Multiple types**: Species-specific groups, government agencies, rehabilitation centers
- **Real organizations**: Legitimate, active conservation groups and wildlife departments

### Step 4: Enjoy Educational Poetry 📖
- **5-second delay**: Poem appears automatically after organization information
- **RAG-powered**: Pre-written poems when available, AI-generated when needed
- **Educational content**: Fun facts and conservation messages in poetic form
- **Multiple styles**: "If truth be told" format and educational wildlife poetry

### 🔒 Built-in Guardrails

**First Agent (Location)**:
- ❌ Rejects: "hello", "animal", "eagle", "help", random text
- ✅ Accepts: Valid locations like cities, states, countries
- 📝 Error message: "🌍 **Please provide your location to get started!**"

**Second Agent (Animal Selection)**:
- ❌ Rejects: Non-animal inputs, animals not found in your area
- ✅ Accepts: Only animals from the wildlife list provided for your location
- 📝 Error messages: Clear guidance to select from the provided list

**Third Agent (Poetry Generation)**:
- ⏱️ Triggered: 5 seconds after organization information is displayed
- 📚 RAG-first: Searches database for existing poems before AI generation
- 🎯 Automatic: No user input required, seamlessly integrated into conversation flow

### 💬 Example Conversation
```
You: hello world
App: 🌍 Please provide your location to get started!
     Try adding a location please!

You: California
App: **Wildlife near California:**
     • Pond Slider (Data Deficient)
     • Western Fence Lizard (Data Deficient)
     • Great Egret (Data Deficient)
     • California Newt (Data Deficient)
     [... 4 more species]
     Type an animal name to find conservation organizations.

You: lion
App: ❌ That animal wasn't found in your area.
     Please choose from these animals found near California:
     [Shows same list as above]

You: Great Egret
App: **Great Egret Conservation Organizations:**
     • International Bird Rescue
       Website: birdrescue.org
       Description: Focuses on rescuing and rehabilitating injured aquatic birds
       Location: San Francisco Bay Area, California
     • California Department of Fish and Wildlife
       https://wildlife.ca.gov
     • US Fish and Wildlife Service
       https://www.fws.gov

[5 seconds later...]
App: 🐾 **A Poem About the Great Egret**

     A graceful bird, if truth be told,
     is not just pretty to behold
     with snowy plumage and keen sight,
     it shouldn't take an ornithologist
     to see this wading wonder
     hunts with patience day and night
```

## 🏗️ Technical Architecture

### Intelligent Agent System
- **Agent 1 (Location)**: Location parsing → Wildlife discovery with guardrails
- **Agent 2 (Organizations)**: Animal validation → AI-powered organization search
- **Agent 3 (Poetry)**: Automatic poem generation 5 seconds after organization info
- **Session State**: Persistent conversation flow with species list validation

### Wildlife Data Sources
- **iNaturalist API**: Research-grade wildlife observations with taxonomic classification
- **GBIF API**: Global Biodiversity Information Facility with geographic filtering
- **Smart filtering**: Taxonomic diversity, geographic bounds, conservation status

### AI-Powered Organization Search
- **OpenAI GPT-4**: Intelligent search for relevant conservation organizations
- **Real-time results**: Live search based on animal type and location
- **Fallback system**: Government wildlife agencies as reliable backup
- **Bullet-point format**: Clear, structured organization information

## ⚙️ Setup

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Get API Key:**
   - Get OpenAI API key from [OpenAI Platform](https://platform.openai.com/api-keys)

3. **Create `.env.local` file:**
   ```bash
   OPENAI_API_KEY=your_openai_api_key_here
   ```

4. **Start development:**
   ```bash
   pnpm dev
   ```

5. **Open [http://localhost:3000](http://localhost:3000)** to start finding wildlife organizations!

## 🛠️ Tech Stack

- **Next.js 15** - React framework with App Router and Turbopack
- **AI SDK 5** - AI integration with OpenAI GPT-4
- **TypeScript** - Type-safe development with strict validation
- **shadcn/ui** - Modern component library (New York style)
- **Tailwind CSS v4** - Utility-first styling with CSS variables
- **AI Elements** - Pre-built conversation components from Vercel

## 🔌 API Integrations

- **OpenStreetMap Nominatim**: Free geocoding for global location support
- **iNaturalist API**: Research-grade wildlife observation data
- **GBIF API**: Comprehensive species occurrence data with geographic filtering
- **OpenAI GPT-4**: Natural language processing and intelligent organization search

## 🚦 User Flow & Validation

### Location Input Validation
- Detects and rejects non-location inputs using regex patterns
- Handles various location formats (city, state, country combinations)
- Provides clear error messages with examples

### Animal Selection Validation
- Strict enforcement: Only animals from the provided species list are accepted
- Rejects animals not found in the user's geographic area
- Clear feedback when selections are invalid

### Conversation State Management
- Session-based storage maintains species list consistency
- Prevents users from selecting animals from different locations
- Seamless conversation flow with persistent context

## 🎯 Key Improvements

### Enhanced Guardrails
- **Smart input validation** prevents users from deviating from the intended flow
- **Context-aware responses** guide users to correct inputs
- **Session consistency** ensures animal selections match location results

### AI-Powered Organization Search
- **Real-time search** using OpenAI's knowledge base
- **Contextual results** based on both animal type and user location
- **Multiple organization types**: Rehabilitation centers, government agencies, conservation groups

### Improved User Experience
- **Clear error messages** with specific guidance
- **Visual feedback** using emojis and formatting
- **Consistent styling** with wildlife conservation theme

## 🌍 Conservation Impact

This tool helps users:
- **Discover local wildlife** specific to their geographic area
- **Connect with real organizations** actively working on conservation
- **Take meaningful action** through direct links to wildlife groups
- **Learn about biodiversity** through scientifically accurate data

## 📝 Development

### Project Structure
```
/app/api/chat/          # AI conversation endpoint with guardrails
/app/api/poem/          # Poetry generation endpoint with RAG database
/lib/conservation-tools.ts  # Wildlife data and AI organization search
/lib/agent-prompts.ts   # Agent system prompts and instructions
/lib/animal-poems-rag.ts    # RAG database with wildlife poems
/components/ai-elements/    # Pre-built conversation UI components
/components/roadrunner-loader.tsx  # Looney Tunes inspired loading animation
```

### Adding New Features
- **Additional guardrails**: Extend validation patterns in route.ts
- **New data sources**: Add APIs to conservation-tools.ts
- **Enhanced prompts**: Update agent instructions in agent-prompts.ts

## 🤝 Contributing

This project uses **pnpm** as the package manager. The system is modular and can be extended with:
- Enhanced input validation patterns
- Additional wildlife data sources
- More sophisticated AI prompts
- International organization databases
- Advanced conversation flows

## 🙏 Credits & Acknowledgments

### Educational Poetry Content
- **Jim Vanas** - Original wildlife poetry examples, including "Wildlife Respect" and "Group (Collective) Names of Animals"
- Poetry examples used with permission for educational conservation purposes
- Jim Vanas's work provides the foundation for our educational wildlife poetry approach

### Visual & Audio Elements
- **Looney Tunes / Warner Bros.** - Roadrunner character design and animation style inspiration
- Roadrunner GIF via Tenor (tenor.com) - Used for educational loading animation
- "Meep Meep" sound effects inspired by classic Looney Tunes Road Runner cartoons
- All Looney Tunes references used under fair use for educational purposes

### Wildlife Data Sources
- **iNaturalist** - Research-grade wildlife observation data (inaturalist.org)
- **GBIF** - Global Biodiversity Information Facility occurrence data (gbif.org)
- **OpenStreetMap** - Geocoding services via Nominatim (openstreetmap.org)

### AI & Technology
- **OpenAI** - GPT-4 language model for organization search and poetry generation
- **Vercel** - AI SDK and UI components for conversation interface
- **Next.js Team** - React framework and development tools

## 📄 License

Open source - designed for conservation education and wildlife protection efforts worldwide!

All educational content and poetry examples are used with respect for original creators and under fair use principles for educational conservation purposes.

---

**🌿 Start discovering wildlife and conservation organizations in your area at [http://localhost:3000](http://localhost:3000)!**