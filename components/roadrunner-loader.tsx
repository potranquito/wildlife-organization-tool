"use client";

// Roadrunner Loading Animation Component
// CREDITS:
// - Looney Tunes/Warner Bros.: Roadrunner character design and "meep meep" sound inspiration
// - Used under fair use for educational conservation purposes
// - GIF hosted via Tenor.com

import { useEffect, useRef } from "react";

export function RoadrunnerLoader() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      // Try to create audio element for the MP3 file
      try {
        const audio = new Audio("/meep-meep.mp3");
        audio.volume = 0.7; // Set volume to 70%
        audioRef.current = audio;

        // Set up to play only the "meep meep" portion of the audio
        // The meep meep sound occurs between 1.3 and 1.9 seconds
        const startTime = 1.3; // Start at 1.3 seconds
        const endTime = 1.9; // End at 1.9 seconds

        const playMeepSound = () => {
          if (audioRef.current) {
            // Set playback position to start time
            audioRef.current.currentTime = startTime;

            // Play the audio
            audioRef.current.play().catch(error => {
              console.log("Audio play failed (file may not exist):", error);
            });

            // Stop after the meep meep part
            setTimeout(() => {
              if (audioRef.current) {
                audioRef.current.pause();
              }
            }, (endTime - startTime) * 1000);
          }
        };

        // Play initial sound after 1 second
        setTimeout(playMeepSound, 1000);

        // Then play sound every 2 seconds after that
        const interval = setInterval(playMeepSound, 2000);

        return () => {
          clearInterval(interval);
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
          }
        };
      } catch (error) {
        console.log("Audio setup failed (meep-meep.mp3 not found):", error);
        // Continue without audio - the visual animation will still work
      }
    }
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-8 px-4">
      {/* Roadrunner Animation - with fallback */}
      <div className="w-full max-w-sm mx-auto">
        <div className="relative">
          {/* Primary: Tenor GIF Embed */}
          <iframe
            src="https://tenor.com/embed/9195319786783468631"
            width="100%"
            height="280"
            style={{ border: 'none' }}
            allow="autoplay"
            title="Roadrunner Running GIF"
            className="rounded-lg"
            onError={(e) => {
              // Hide iframe if it fails to load
              (e.target as HTMLIFrameElement).style.display = 'none';
              // Show fallback animation
              const fallback = document.getElementById('roadrunner-fallback');
              if (fallback) fallback.style.display = 'block';
            }}
          />
          
          {/* Fallback: CSS Animation */}
          <div 
            id="roadrunner-fallback"
            className="hidden w-full h-[280px] flex items-center justify-center bg-gradient-to-r from-yellow-100 to-orange-100 rounded-lg"
          >
            <div className="text-center">
              <div className="text-6xl mb-4 animate-bounce">🏃‍♂️</div>
              <div className="text-lg font-bold text-orange-700 animate-pulse">
                Roadrunner Running...
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Loading text */}
      <div className="mt-4 text-lg text-green-700 font-medium animate-pulse text-center">
        🔍 Thinking fast...
      </div>
    </div>
  );
}