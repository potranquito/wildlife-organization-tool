"use client";

import { useState, useEffect } from 'react';

interface ProgressStep {
  id: string;
  label: string;
  progress: number;
  isActive: boolean;
  isComplete: boolean;
}

export function RoadrunnerLoader() {
  const [steps, setSteps] = useState<ProgressStep[]>([
    { id: 'geocoding', label: 'Processing location', progress: 0, isActive: true, isComplete: false },
    { id: 'gbif', label: 'Searching GBIF Database', progress: 0, isActive: false, isComplete: false },
    { id: 'inaturalist', label: 'Searching iNaturalist Database', progress: 0, isActive: false, isComplete: false },
    { id: 'merging', label: 'Merging wildlife data', progress: 0, isActive: false, isComplete: false }
  ]);

  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSteps(prevSteps => {
        const newSteps = [...prevSteps];
        const currentStep = newSteps[currentStepIndex];

        if (currentStep && !currentStep.isComplete) {
          // Much slower, more realistic progress increment (9 seconds per step)
          // Each step takes about 9 seconds to complete for ~36 second total
          currentStep.progress = Math.min(currentStep.progress + Math.random() * 1.5 + 0.25, 100);

          // Mark as complete if progress reaches 100%
          if (currentStep.progress >= 100) {
            currentStep.progress = 100;
            currentStep.isComplete = true;
            currentStep.isActive = false;

            // Move to next step if available
            if (currentStepIndex < newSteps.length - 1) {
              setCurrentStepIndex(prev => prev + 1);
              newSteps[currentStepIndex + 1].isActive = true;
            }
          }
        }

        return newSteps;
      });
    }, 150); // Update every 150ms for smooth animation

    return () => clearInterval(interval);
  }, [currentStepIndex]);

  return (
    <div className="w-full max-w-lg mx-auto p-6 bg-white/80 backdrop-blur-sm rounded-xl border border-green-200 shadow-lg">
      <div className="text-center mb-6">
        <div className="text-3xl mb-2">🔍</div>
        <h3 className="text-lg font-semibold text-green-800">Discovering Wildlife</h3>
        <p className="text-sm text-green-600">Searching biodiversity databases...</p>
      </div>

      <div className="space-y-4">
        {steps.map((step, index) => (
          <div key={step.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  step.isComplete
                    ? 'bg-green-500 text-white'
                    : step.isActive
                      ? 'bg-blue-500 text-white animate-pulse'
                      : 'bg-gray-200 text-gray-500'
                }`}>
                  {step.isComplete ? '✓' : index + 1}
                </div>
                <span className={`text-sm font-medium ${
                  step.isActive ? 'text-blue-700' : step.isComplete ? 'text-green-700' : 'text-gray-500'
                }`}>
                  {step.label}
                </span>
              </div>
              <span className={`text-sm font-bold ${
                step.isActive ? 'text-blue-600' : step.isComplete ? 'text-green-600' : 'text-gray-400'
              }`}>
                {Math.round(step.progress)}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-300 ease-out ${
                  step.isComplete
                    ? 'bg-green-500'
                    : step.isActive
                      ? 'bg-blue-500'
                      : 'bg-gray-300'
                }`}
                style={{ width: `${step.progress}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Additional Loading Indicators */}
      <div className="mt-6 text-center">
        {currentStepIndex === 0 && (
          <div className="text-sm text-blue-600 animate-pulse">
            📍 Converting location to coordinates...
          </div>
        )}
        {currentStepIndex === 1 && (
          <div className="text-sm text-blue-600 animate-pulse">
            🌍 Querying global biodiversity records...
          </div>
        )}
        {currentStepIndex === 2 && (
          <div className="text-sm text-blue-600 animate-pulse">
            🔬 Fetching research-grade observations...
          </div>
        )}
        {currentStepIndex === 3 && (
          <div className="text-sm text-blue-600 animate-pulse">
            🧬 Combining and deduplicating species data...
          </div>
        )}
      </div>
    </div>
  );
}