"use client";

// Roadrunner Loading Animation Component
// CREDITS:
// - Looney Tunes/Warner Bros.: Roadrunner character design and "meep meep" sound inspiration
// - Used under fair use for educational conservation purposes
// - GIF hosted via Tenor.com

// No imports needed since audio was removed

export function RoadrunnerLoader() {
  // Audio removed per user request

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