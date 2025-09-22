"use client";

import { useState, useEffect } from 'react';

interface ErrorLoaderProps {
  errorType: 'invalid-location' | 'invalid-animal' | 'general-error';
  message?: string;
}

export function ErrorLoader({ errorType, message }: ErrorLoaderProps) {
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        const newProgress = prev + Math.random() * 15 + 5; // Faster progress for errors
        if (newProgress >= 100) {
          setIsComplete(true);
          return 100;
        }
        return newProgress;
      });
    }, 200);

    return () => clearInterval(interval);
  }, []);

  const getErrorConfig = () => {
    switch (errorType) {
      case 'invalid-location':
        return {
          icon: '🌍',
          title: 'Location Processing',
          subtitle: 'Validating location input...',
          color: 'red'
        };
      case 'invalid-animal':
        return {
          icon: '🐾',
          title: 'Animal Validation',
          subtitle: 'Checking animal selection...',
          color: 'orange'
        };
      default:
        return {
          icon: '⚠️',
          title: 'Processing Request',
          subtitle: 'Validating input...',
          color: 'red'
        };
    }
  };

  const config = getErrorConfig();

  return (
    <div className="w-full max-w-lg mx-auto p-6 bg-white/80 backdrop-blur-sm rounded-xl border border-red-200 shadow-lg">
      <div className="text-center mb-6">
        <div className="text-3xl mb-2">{config.icon}</div>
        <h3 className="text-lg font-semibold text-red-800">{config.title}</h3>
        <p className="text-sm text-red-600">{config.subtitle}</p>
        {message && (
          <p className="text-xs text-gray-500 mt-2">{message}</p>
        )}
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                isComplete
                  ? 'bg-red-500 text-white'
                  : 'bg-red-500 text-white animate-pulse'
              }`}>
                {isComplete ? '✗' : '!'}
              </div>
              <span className="text-sm font-medium text-red-700">
                Analyzing input
              </span>
            </div>
            <span className="text-sm font-bold text-red-600">
              {Math.round(progress)}%
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all duration-300 ease-out bg-red-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Status Message */}
      <div className="mt-6 text-center">
        {!isComplete ? (
          <div className="text-sm text-red-600 animate-pulse">
            🔍 Checking your input for errors...
          </div>
        ) : (
          <div className="text-sm text-red-700">
            ❌ Input validation failed
          </div>
        )}
      </div>
    </div>
  );
}