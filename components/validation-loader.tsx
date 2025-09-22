"use client";

import { useState, useEffect } from 'react';

interface ValidationLoaderProps {
  type: 'location' | 'animal';
}

export function ValidationLoader({ type }: ValidationLoaderProps) {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);

  const steps = type === 'location'
    ? [
        'Analyzing location input',
        'Checking for ambiguity',
        'Validating location format'
      ]
    : [
        'Validating animal selection',
        'Checking species database',
        'Confirming animal match'
      ];

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        // 24 seconds total / 4 steps = 6 seconds per step
        const newProgress = prev + Math.random() * 2.2 + 0.6; // Adjusted increment for 24 second total

        if (newProgress >= 100) {
          // Move to next step if available
          if (currentStep < steps.length - 1) {
            setCurrentStep(prev => prev + 1);
            return 0; // Reset progress for next step
          }
          return 100;
        }
        return newProgress;
      });
    }, 150);

    return () => clearInterval(interval);
  }, [currentStep, steps.length]);

  const config = type === 'location'
    ? {
        icon: '🌍',
        title: 'Location Validation',
        subtitle: 'Checking your location input...',
        color: 'blue'
      }
    : {
        icon: '🐾',
        title: 'Animal Validation',
        subtitle: 'Verifying animal selection...',
        color: 'orange'
      };

  return (
    <div className="w-full max-w-lg mx-auto p-6 bg-white/80 backdrop-blur-sm rounded-xl border border-blue-200 shadow-lg">
      <div className="text-center mb-6">
        <div className="text-3xl mb-2">{config.icon}</div>
        <h3 className="text-lg font-semibold text-blue-800">{config.title}</h3>
        <p className="text-sm text-blue-600">{config.subtitle}</p>
      </div>

      <div className="space-y-4">
        {steps.map((step, index) => (
          <div key={index} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  index < currentStep
                    ? 'bg-green-500 text-white'
                    : index === currentStep
                      ? 'bg-blue-500 text-white animate-pulse'
                      : 'bg-gray-200 text-gray-500'
                }`}>
                  {index < currentStep ? '✓' : index + 1}
                </div>
                <span className={`text-sm font-medium ${
                  index === currentStep ? 'text-blue-700' :
                  index < currentStep ? 'text-green-700' : 'text-gray-500'
                }`}>
                  {step}
                </span>
              </div>
              <span className={`text-sm font-bold ${
                index === currentStep ? 'text-blue-600' :
                index < currentStep ? 'text-green-600' : 'text-gray-400'
              }`}>
                {index === currentStep ? Math.round(progress) : index < currentStep ? 100 : 0}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-300 ease-out ${
                  index < currentStep
                    ? 'bg-green-500'
                    : index === currentStep
                      ? 'bg-blue-500'
                      : 'bg-gray-300'
                }`}
                style={{
                  width: `${index === currentStep ? progress : index < currentStep ? 100 : 0}%`
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Status Message */}
      <div className="mt-6 text-center">
        <div className="text-sm text-blue-600 animate-pulse">
          🔍 {steps[currentStep]}...
        </div>
      </div>
    </div>
  );
}