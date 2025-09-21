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

export default function Home() {
  const [messages, setMessages] = useState<UIMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      parts: [{ type: "text", text: "🌿 **Welcome to Wildlife Organization Finder!**\n\nI can help you discover local wildlife and connect with conservation organizations. \n\n**To get started:**\n- Share your location (city, state, or country)\n- Discover wildlife in your area\n- Find organizations working to protect them\n\nTry entering your location now!" }]
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => Math.random().toString(36).substring(7));
  const [poemTimeoutId, setPoemTimeoutId] = useState<NodeJS.Timeout | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change or loading state changes
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (poemTimeoutId) {
        clearTimeout(poemTimeoutId);
      }
    };
  }, [poemTimeoutId]);

  // Function to generate and add a poem
  const generatePoem = async (animal: string) => {
    try {
      const response = await fetch("/api/poem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ animal }),
      });

      if (response.ok) {
        const data = await response.json();
        const poemMessage: UIMessage = {
          id: Date.now().toString(),
          role: "assistant",
          parts: [{ type: "text", text: data.response }],
        };
        setMessages((prev) => [...prev, poemMessage]);
      }
    } catch (error) {
      console.error("Error generating poem:", error);
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

  const handleSubmit = async (
    message: { text?: string; files?: any[] },
    event: React.FormEvent
  ) => {
    if (!message.text?.trim() || isLoading) return;

    const userMessage: UIMessage = {
      id: Date.now().toString(),
      role: "user",
      parts: [{ type: "text", text: message.text }],
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    // Ensure minimum 5-second loading time for animation
    const startTime = Date.now();
    const minLoadingTime = 5000;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.text, sessionId }),
      });

      let data;
      try {
        const responseText = await response.text();
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error("Failed to parse response:", parseError);
        throw new Error("Server returned invalid response");
      }

      // Calculate remaining time to reach minimum loading duration
      const elapsedTime = Date.now() - startTime;
      const remainingTime = Math.max(0, minLoadingTime - elapsedTime);

      // Wait for remaining time if needed
      if (remainingTime > 0) {
        await new Promise(resolve => setTimeout(resolve, remainingTime));
      }

      if (response.ok) {
        const assistantMessage: UIMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          parts: [{ type: "text", text: data.response }],
        };
        setMessages((prev) => [...prev, assistantMessage]);

        // Check if this is an organization response and schedule poem generation
        const animal = extractAnimalFromResponse(data.response);
        if (animal) {
          // Clear any existing poem timeout
          if (poemTimeoutId) {
            clearTimeout(poemTimeoutId);
          }

          // Schedule poem generation for 5 seconds later
          const timeoutId = setTimeout(() => {
            generatePoem(animal);
            setPoemTimeoutId(null);
          }, 5000);

          setPoemTimeoutId(timeoutId);
        }
      } else {
        throw new Error(data.error || "Failed to get response");
      }
    } catch (error) {
      console.error("Error:", error);

      // Still respect minimum loading time even for errors
      const elapsedTime = Date.now() - startTime;
      const remainingTime = Math.max(0, minLoadingTime - elapsedTime);

      if (remainingTime > 0) {
        await new Promise(resolve => setTimeout(resolve, remainingTime));
      }

      const errorMessage: UIMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        parts: [{ type: "text", text: "🦎 **Oops! Something went wrong**\n\nI encountered a technical issue while processing your request. This might be due to:\n\n- Server connectivity issues\n- High traffic volume\n- Temporary API limitations\n\nPlease try again in a moment. If the problem persists, try refreshing the page." }],
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }

    // Reset form
    (event.target as HTMLFormElement).reset();
  };

  return (
    <div className="h-screen bg-gradient-to-br from-green-50 to-blue-50 flex flex-col max-w-4xl mx-auto">
      {/* Header - fixed height */}
      <div className="flex-shrink-0 border-b border-green-200 bg-white/80 backdrop-blur-sm p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="text-2xl">🌿🦅</div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-green-700 to-blue-700 bg-clip-text text-transparent">
            Wildlife Organization Finder
          </h1>
        </div>
        <p className="text-sm text-green-600 mt-1">Discover wildlife and connect with conservation organizations</p>
      </div>

      {/* Chat area - scrollable content */}
      <div className="flex-1 overflow-hidden bg-white/30 backdrop-blur-sm">
        <div ref={scrollAreaRef} className="h-full overflow-y-auto p-4">
          <div className="space-y-4 pb-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-12">
                <h2 className="text-xl font-bold text-green-800 mb-2">🦋 Start your wildlife journey</h2>
                <p className="text-green-700">Share your location to discover amazing wildlife and conservation organizations!</p>
              </div>
            ) : (
              messages.map((message) => (
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
              ))
            )}
            {isLoading && (
              <div className="flex justify-center items-center my-8">
                <div className="w-full max-w-md">
                  <RoadrunnerLoader />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Input area - sticky at bottom */}
      <div className="flex-shrink-0 p-4 bg-white/50 backdrop-blur-sm border-t border-green-200">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody className="border-green-300 focus-within:ring-green-500">
            <PromptInputTextarea
              placeholder="Share your wildlife thoughts..."
              className="placeholder:text-green-500/70"
            />
            <PromptInputToolbar>
              <div />
              <PromptInputSubmit
                status={isLoading ? "submitted" : undefined}
                className="bg-green-600 hover:bg-green-700 text-white"
              />
            </PromptInputToolbar>
          </PromptInputBody>
        </PromptInput>
      </div>
    </div>
  );
}
