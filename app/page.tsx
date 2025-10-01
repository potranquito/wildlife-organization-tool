"use client";

import { useState, useEffect, useRef } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageAvatar,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import type { UIMessage } from "ai";
import { MessageFormatter } from "@/components/message-formatter";
import { RoadrunnerLoader } from "@/components/roadrunner-loader";
import { OrganizationSearchLoader } from "@/components/organization-search-loader";
import { ErrorLoader } from "@/components/error-loader";
import { ValidationLoader } from "@/components/validation-loader";
import { CONFIG } from "@/lib/config";

type SearchMode = 'initial' | 'location' | 'animal' | 'random';

export default function Home() {
  const [searchMode, setSearchMode] = useState<SearchMode>('initial');
  const [locationCountry, setLocationCountry] = useState('');
  const [locationState, setLocationState] = useState('');
  const [locationCity, setLocationCity] = useState('');
  const [animalInput, setAnimalInput] = useState('');
  const [locationError, setLocationError] = useState('');
  const [countdown, setCountdown] = useState(100);
  const [showExtinctionModal, setShowExtinctionModal] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [animalImage, setAnimalImage] = useState<string | null>(null);
  const [animalImageName, setAnimalImageName] = useState<string | null>(null);

  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<'wildlife' | 'organizations' | 'error' | 'validation' | null>(null);
  const [selectedAnimal, setSelectedAnimal] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'invalid-location' | 'invalid-animal' | 'general-error' | null>(null);
  const [validationType, setValidationType] = useState<'location' | 'animal' | null>(null);
  const [sessionId] = useState(() => {
    // Check if we have a stored session ID from previous page load
    if (typeof window !== 'undefined') {
      const storedSessionId = localStorage.getItem('wildlife_session_id');
      if (storedSessionId) {
        console.log(`♻️ REUSING SESSION: ${storedSessionId}`);
        return storedSessionId;
      }
    }

    // Generate a new stable session ID
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Store it in localStorage for persistence across page refreshes
    if (typeof window !== 'undefined') {
      localStorage.setItem('wildlife_session_id', newSessionId);
      console.log(`🆕 NEW SESSION CREATED: ${newSessionId}`);
    }

    return newSessionId;
  });
  const [informationTimeoutId, setInformationTimeoutId] = useState<NodeJS.Timeout | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Countdown timer effect
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (!hasInteracted) {
            setShowExtinctionModal(true);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [hasInteracted]);

  // Mark as interacted when user starts using the app
  useEffect(() => {
    if (searchMode !== 'initial' || messages.length > 0) {
      setHasInteracted(true);
    }
  }, [searchMode, messages]);

  // Auto-scroll to bottom when messages change or loading state changes
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (informationTimeoutId) {
        clearTimeout(informationTimeoutId);
      }
    };
  }, [informationTimeoutId]);

  // Function to generate and add wildlife information
  const generateInformation = async (animal: string, location?: string) => {
    try {
      const response = await fetch("/api/information", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ animal, location }),
      });

      if (response.ok) {
        const data = await response.json();
        const informationMessage: UIMessage = {
          id: Date.now().toString(),
          role: "assistant",
          parts: [{ type: "text", text: data.response }],
        };
        setMessages((prev) => [...prev, informationMessage]);
      }
    } catch (error) {
      console.error("Error generating information:", error);
    }
  };

  // Fetch animal image from Wikimedia
  const fetchAnimalImage = async (animalName: string) => {
    try {
      const response = await fetch('/api/wikimedia/animal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ animalName }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.animal?.imageUrl) {
          setAnimalImage(data.animal.imageUrl);
          setAnimalImageName(data.animal.name);
          console.log(`🖼️ Image loaded for ${data.animal.name}`);
        }
      }
    } catch (error) {
      console.error('Failed to fetch animal image:', error);
    }
  };

  // Helper function to extract animal name from organization response
  const extractAnimalFromResponse = (text: string): string | null => {
    // Look for pattern like "**[Animal Name] Conservation Organizations:**"
    const orgMatch = text.match(/\*\*([^*]+)\s+Conservation Organizations:\*\*/);
    if (orgMatch) {
      return orgMatch[1].trim();
    }

    // Look for pattern in the closing message like "protect [Animal Name]"
    const protectMatch = text.match(/protect\s+([^.]+)\./);
    if (protectMatch) {
      return protectMatch[1].trim();
    }

    // Look for pattern in the closing message like "help protect [Animal Name]"
    const helpProtectMatch = text.match(/help protect\s+([^.]+)\./);
    if (helpProtectMatch) {
      return helpProtectMatch[1].trim();
    }

    // Look for animal name at the start of a response (fallback)
    const responseMatch = text.match(/\*\*([A-Za-z\s]+) Conservation Organizations:\*\*/);
    if (responseMatch) {
      return responseMatch[1].trim();
    }

    return null;
  };

  // Validation: Check if user is trying to enter city/state before country
  const validateLocationInput = (field: 'state' | 'city', value: string) => {
    if (!locationCountry && value.trim()) {
      setLocationError('Please enter country first (e.g., US or United States)');
      return false;
    }
    setLocationError('');
    return true;
  };

  // Handle location submission
  const handleLocationSubmit = async () => {
    if (!locationCountry.trim()) {
      setLocationError('Country is required');
      return;
    }

    setLocationError('');
    const locationParts = [locationCity, locationState, locationCountry].filter(Boolean);
    const locationString = locationParts.join(', ');

    setSearchMode('random'); // Switch to chat view
    await submitMessage(locationString);
  };

  // Handle animal name submission
  const handleAnimalSubmit = async () => {
    if (!animalInput.trim()) return;
    setSearchMode('random'); // Switch to chat view
    await submitMessage(animalInput);
  };

  // Handle random animal selection
  const handleRandomAnimal = async () => {
    await submitMessage('Surprise me with a random animal');
  };

  const submitMessage = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;

    const userMessage: UIMessage = {
      id: Date.now().toString(),
      role: "user",
      parts: [{ type: "text", text: messageText }],
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    // Determine loading type based on message content
    // Check if this looks like a location query (first step)
    const locationPatterns = [
      /\b(city|state|country|location)\b/i,
      /\b[A-Z][a-z]+(,\s*[A-Z][a-z]+)*\b/, // City, State format
      /\b(in|near|around|from)\s+[A-Z]/i,
      /^\s*[A-Z][a-z]+(\s+[A-Z][a-z]+)*(\s*,\s*[A-Z][a-z]+(\s+[A-Z][a-z]+)*)*\s*$/
    ];

    const isLocationQuery = locationPatterns.some(pattern => pattern.test(messageText || ''));

    if (isLocationQuery) {
      setLoadingType('wildlife');
    } else {
      // This is likely an animal selection (organization search)
      setLoadingType('organizations');
      setSelectedAnimal(messageText.trim());
    }

    // Track start time for potential use
    const startTime = Date.now();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: messageText, sessionId }),
      });

      let data;
      try {
        const responseText = await response.text();
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error("Failed to parse response:", parseError);
        throw new Error("Server returned invalid response");
      }

      // No artificial delay - show response immediately when ready

      if (response.ok) {
        // Check if this is a disambiguation response - show immediately, no loader
        const isDisambiguationResponse = data.response.includes('🌍 **Please add more info to your location!**');

        // Check if this is other error responses that should show error loader
        const isErrorResponse = data.response.includes('🐾 **Please select an animal from the list!**') ||
                               data.response.includes('❌ **"') ||
                               data.response.includes('❌ **I couldn\'t match your response') ||
                               data.response.includes('🌍 **') && data.response.includes('Could not understand');

        if (isErrorResponse) {
          // Show error loader briefly before showing error message
          setLoadingType('error');
          if (data.response.includes('🐾') || data.response.includes('❌ **"') || data.response.includes('animal from the list')) {
            setErrorType('invalid-animal');
          } else {
            setErrorType('invalid-location');
          }

          // Show error loader for 2 seconds, then show message
          setTimeout(() => {
            setIsLoading(false);
            setLoadingType(null);
            setErrorType(null);

            const assistantMessage: UIMessage = {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              parts: [{ type: "text", text: data.response }],
            };
            setMessages((prev) => [...prev, assistantMessage]);
          }, 2000);
          return; // Don't show message immediately
        }

        const assistantMessage: UIMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          parts: [{ type: "text", text: data.response }],
        };
        setMessages((prev) => [...prev, assistantMessage]);

        // Check if this is an organization response and schedule information generation
        const animal = extractAnimalFromResponse(data.response);
        if (animal) {
          // Fetch animal image from Wikimedia
          fetchAnimalImage(animal);

          // Clear any existing information timeout
          if (informationTimeoutId) {
            clearTimeout(informationTimeoutId);
          }

          // Add indicator message that information is coming
          const indicatorMessage: UIMessage = {
            id: (Date.now() + 2).toString(),
            role: "assistant",
            parts: [{ type: "text", text: `📊 **Enriching with Conservation Data**\n\n🔍 Searching RAG database for detailed information about the ${animal}...\n⏳ This may take a few seconds...` }],
          };
          setMessages((prev) => [...prev, indicatorMessage]);

          // Schedule information generation based on configuration
          const timeoutId = setTimeout(() => {
            generateInformation(animal); // Location context will be extracted from chat session
            setInformationTimeoutId(null);
          }, CONFIG.timing.poemDelay); // Keeping same timing config

          setInformationTimeoutId(timeoutId);
        }
      } else {
        throw new Error(data.error || "Failed to get response");
      }
    } catch (error) {
      console.error("Error:", error);

      // Show error immediately without artificial delay

      const errorMessage: UIMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        parts: [{ type: "text", text: "🦎 **Oops! Something went wrong**\n\nI encountered a technical issue while processing your request. This might be due to:\n\n- Server connectivity issues\n- High traffic volume\n- Temporary API limitations\n\nPlease try again in a moment. If the problem persists, try refreshing the page." }],
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setLoadingType(null);
      setSelectedAnimal(null);
      setValidationType(null);
    }
  };

  return (
    <div className="h-screen bg-gradient-to-br from-green-50 to-blue-50 flex flex-col max-w-4xl mx-auto">
      {/* Extinction Modal */}
      {showExtinctionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md mx-4 text-center shadow-2xl border-4 border-red-500">
            <div className="text-6xl mb-4">💀</div>
            <h2 className="text-2xl font-bold text-red-600 mb-2">Oooops another animal went extinct</h2>
            <p className="text-gray-600 mb-6">Refresh to try again</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      )}

      {/* Header - fixed height */}
      <div className="flex-shrink-0 border-b border-green-200 bg-white/80 backdrop-blur-sm p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 justify-center">
            <div className="text-2xl">🐯</div>
            <div className="text-center">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-green-700 to-blue-700 bg-clip-text text-transparent">
                Wildlife Extinction Timer
              </h1>
              <p className="text-sm text-green-600 mt-1">Learn when endangered animals go extinct</p>
            </div>
            <div className="text-2xl">🐼</div>
          </div>

          {/* Countdown Timer */}
          <div className="ml-4 flex flex-col items-center">
            <div className={`text-3xl font-bold ${countdown <= 10 ? 'text-red-600 animate-pulse' : countdown <= 30 ? 'text-orange-600' : 'text-green-600'}`}>
              {countdown}
            </div>
            <div className="text-xs text-gray-500">seconds</div>
          </div>
        </div>
      </div>

      {/* Initial Mode Selection - Three Options */}
      {searchMode === 'initial' && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-2xl space-y-6">
            <h2 className="text-2xl font-bold text-center text-green-800 mb-8">
              How would you like to discover wildlife?
            </h2>

            <div className="grid gap-4">
              {/* Option 1: Input Animal */}
              <button
                onClick={() => setSearchMode('animal')}
                className="p-6 bg-white rounded-lg border-2 border-green-200 hover:border-green-400 hover:bg-green-50 transition-all text-left group"
              >
                <div className="flex items-start gap-4">
                  <div className="text-3xl">🦁</div>
                  <div>
                    <h3 className="text-lg font-bold text-green-800 group-hover:text-green-900">
                      Search by Animal Name
                    </h3>
                    <p className="text-sm text-green-600 mt-1">
                      Enter a common or scientific name to find conservation organizations
                    </p>
                  </div>
                </div>
              </button>

              {/* Option 2: Input Location */}
              <button
                onClick={() => setSearchMode('location')}
                className="p-6 bg-white rounded-lg border-2 border-green-200 hover:border-green-400 hover:bg-green-50 transition-all text-left group"
              >
                <div className="flex items-start gap-4">
                  <div className="text-3xl">📍</div>
                  <div>
                    <h3 className="text-lg font-bold text-green-800 group-hover:text-green-900">
                      Search by Location
                    </h3>
                    <p className="text-sm text-green-600 mt-1">
                      Discover wildlife in your area (requires country or country + state)
                    </p>
                  </div>
                </div>
              </button>

              {/* Option 3: Random Animal */}
              <button
                onClick={() => {
                  setSearchMode('random');
                  handleRandomAnimal();
                }}
                className="p-6 bg-white rounded-lg border-2 border-green-200 hover:border-green-400 hover:bg-green-50 transition-all text-left group"
              >
                <div className="flex items-start gap-4">
                  <div className="text-3xl">🎲</div>
                  <div>
                    <h3 className="text-lg font-bold text-green-800 group-hover:text-green-900">
                      Surprise Me
                    </h3>
                    <p className="text-sm text-green-600 mt-1">
                      Get a random animal and discover its conservation efforts
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Location Input Mode */}
      {searchMode === 'location' && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-2xl space-y-6 bg-white p-8 rounded-lg border-2 border-green-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-green-800">Enter Location</h2>
              <button
                onClick={() => setSearchMode('initial')}
                className="text-sm text-green-600 hover:text-green-800"
              >
                ← Back
              </button>
            </div>

            <div className="space-y-4">
              {/* Country Input - Required First */}
              <div>
                <label className="block text-sm font-medium text-green-700 mb-2">
                  Country <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={locationCountry}
                  onChange={(e) => {
                    setLocationCountry(e.target.value);
                    if (e.target.value.trim()) setLocationError('');
                  }}
                  placeholder="e.g., United States, US, Canada, UK"
                  className="w-full p-3 border-2 border-green-200 rounded-lg focus:border-green-500 focus:outline-none"
                />
              </div>

              {/* State Input - Optional */}
              <div>
                <label className="block text-sm font-medium text-green-700 mb-2">
                  State / Province (optional)
                </label>
                <input
                  type="text"
                  value={locationState}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (validateLocationInput('state', value)) {
                      setLocationState(value);
                    } else {
                      setLocationState('');
                    }
                  }}
                  placeholder="e.g., California, Ontario"
                  className="w-full p-3 border-2 border-green-200 rounded-lg focus:border-green-500 focus:outline-none"
                  disabled={!locationCountry.trim()}
                />
              </div>

              {/* City Input - Optional */}
              <div>
                <label className="block text-sm font-medium text-green-700 mb-2">
                  City (optional)
                </label>
                <input
                  type="text"
                  value={locationCity}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (validateLocationInput('city', value)) {
                      setLocationCity(value);
                    } else {
                      setLocationCity('');
                    }
                  }}
                  placeholder="e.g., Miami, Toronto"
                  className="w-full p-3 border-2 border-green-200 rounded-lg focus:border-green-500 focus:outline-none"
                  disabled={!locationCountry.trim()}
                />
              </div>

              {/* Inline Error Message */}
              {locationError && (
                <div className="text-red-600 text-sm font-medium bg-red-50 p-3 rounded-lg border border-red-200">
                  ⚠️ {locationError}
                </div>
              )}

              {/* Submit Button */}
              <button
                onClick={handleLocationSubmit}
                disabled={!locationCountry.trim()}
                className="w-full p-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                Find Wildlife
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animal Input Mode */}
      {searchMode === 'animal' && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-2xl space-y-6 bg-white p-8 rounded-lg border-2 border-green-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-green-800">Enter Animal Name</h2>
              <button
                onClick={() => setSearchMode('initial')}
                className="text-sm text-green-600 hover:text-green-800"
              >
                ← Back
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-green-700 mb-2">
                  Common or Scientific Name
                </label>
                <input
                  type="text"
                  value={animalInput}
                  onChange={(e) => setAnimalInput(e.target.value)}
                  placeholder="e.g., Florida Panther, Puma concolor coryi"
                  className="w-full p-3 border-2 border-green-200 rounded-lg focus:border-green-500 focus:outline-none"
                />
              </div>

              <button
                onClick={handleAnimalSubmit}
                disabled={!animalInput.trim()}
                className="w-full p-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                Predict Extinction Time
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat area - visible after search initiated */}
      {(searchMode === 'random' || messages.length > 0) && (
        <div className="flex-1 overflow-hidden bg-white/30 backdrop-blur-sm flex">
          {/* Animal Image Sidebar */}
          {animalImage && (
            <div className="w-80 bg-white/90 border-r border-green-200 p-4 flex flex-col">
              <h3 className="text-lg font-bold text-green-800 mb-3">
                {animalImageName || 'Animal'}
              </h3>
              <div className="flex-1 flex items-center justify-center">
                <img
                  src={animalImage}
                  alt={animalImageName || 'Animal'}
                  className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                />
              </div>
              <p className="text-xs text-gray-500 mt-3 text-center">
                Image from Wikimedia Commons
              </p>
            </div>
          )}

          <div className="flex-1 flex flex-col">
            <div ref={scrollAreaRef} className="flex-1 overflow-y-auto p-4">
              <div className="space-y-4 pb-4">
                {messages.map((message) => (
                  <Message key={message.id} from={message.role}>
                    <MessageContent className={
                      message.role === "assistant"
                        ? "max-w-none !bg-green-50 border border-green-200 p-4 rounded-lg"
                        : "!bg-green-600 !text-white p-3 rounded-lg"
                    }>
                      {message.role === "assistant" ? (
                        <MessageFormatter
                          content={message.parts[0]?.type === 'text' ? message.parts[0].text : ''}
                        />
                      ) : (
                        <div className="text-white">
                          {message.parts[0]?.type === 'text' ? message.parts[0].text : ''}
                        </div>
                      )}
                    </MessageContent>
                  </Message>
                ))}
              {isLoading && (
                <div className="flex justify-center items-center my-8">
                  <div className="w-full max-w-md">
                    {loadingType === 'wildlife' && <RoadrunnerLoader />}
                    {loadingType === 'organizations' && selectedAnimal && (
                      <OrganizationSearchLoader animalName={selectedAnimal} />
                    )}
                    {loadingType === 'error' && errorType && (
                      <ErrorLoader errorType={errorType} />
                    )}
                    {loadingType === 'validation' && validationType && (
                      <ValidationLoader type={validationType} />
                    )}
                    {!loadingType && <RoadrunnerLoader />} {/* Fallback */}
                  </div>
                </div>
              )}
              </div>
            </div>

            {/* Input area - for follow-up responses */}
            <div className="flex-shrink-0 p-4 bg-white/50 backdrop-blur-sm border-t border-green-200">
            <div className="flex gap-2">
              <input
                type="text"
                id="chat-input"
                placeholder="Type animal name or your response..."
                className="flex-1 p-3 border-2 border-green-200 rounded-lg focus:border-green-500 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                    const value = e.currentTarget.value;
                    e.currentTarget.value = '';
                    submitMessage(value);
                  }
                }}
                disabled={isLoading}
              />
              <button
                onClick={() => {
                  const input = document.getElementById('chat-input') as HTMLInputElement;
                  if (input && input.value.trim()) {
                    const value = input.value;
                    input.value = '';
                    submitMessage(value);
                  }
                }}
                disabled={isLoading}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Send
              </button>
              <button
                onClick={() => {
                  setSearchMode('initial');
                  setMessages([]);
                  setLocationCountry('');
                  setLocationState('');
                  setLocationCity('');
                  setAnimalInput('');
                  setAnimalImage(null);
                  setAnimalImageName(null);
                  // Clear session storage to start fresh
                  if (typeof window !== 'undefined') {
                    localStorage.removeItem('wildlife_session_id');
                  }
                  // Reload the page to get a fresh session
                  window.location.reload();
                }}
                className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white font-bold rounded-lg transition-colors"
              >
                Reset
              </button>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
