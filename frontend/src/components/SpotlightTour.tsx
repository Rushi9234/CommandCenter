import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TourStep {
  id: string;
  title: string;
  text: string;
  targetSelector?: string;
}

const DEFAULT_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to CommandCenter',
    text: "Your team's space for goals, projects, and progress.",
  },
  {
    id: 'pulse',
    title: 'Start with Pulse',
    text: 'See what needs your attention and share your daily progress.',
    targetSelector: '[data-tour-target="pulse"]',
  },
  {
    id: 'teams',
    title: 'Find Your People',
    text: 'Join teams, manage classes, and organize your workspace.',
    targetSelector: '[data-tour-target="teams"]',
  },
  {
    id: 'goals',
    title: 'Set the Direction',
    text: 'Create goals, track progress, and move work through approval.',
    targetSelector: '[data-tour-target="goals"]',
  },
  {
    id: 'projects',
    title: 'Turn Goals into Work',
    text: 'Break goals into projects and actionable tasks.',
    targetSelector: '[data-tour-target="projects"]',
  },
  {
    id: 'sos-hub',
    title: 'Stuck? Surface It.',
    text: 'Raise blockers, get attention, and keep work moving.',
    targetSelector: '[data-tour-target="sos-hub"]',
  },
  {
    id: 'leaderboard',
    title: 'See Your Impact',
    text: 'Track contribution, compare progress, and see how your work adds up.',
    targetSelector: '[data-tour-target="leaderboard"]',
  },
  {
    id: 'analytics',
    title: 'Understand the Bigger Picture',
    text: 'Use team insights and analytics to understand progress and activity.',
    targetSelector: '[data-tour-target="analytics"]',
  },
  {
    id: 'notifications',
    title: 'Stay in the Loop',
    text: 'Get the updates that matter without constantly checking every page.',
    targetSelector: '[data-tour-target="notifications"]',
  },
  {
    id: 'profile',
    title: 'Your Account',
    text: 'Manage your profile, account details, and security from one place.',
    targetSelector: '[data-tour-target="profile"]',
  },
  {
    id: 'finish',
    title: "You're Ready 🚀",
    text: 'Check your team. See your goals. Get to work.',
  },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface CardPosition {
  top: number;
  left: number;
  placement: 'top' | 'bottom' | 'left' | 'right';
}

interface SpotlightTourProps {
  isOpen: boolean;
  onClose: () => void;
  steps?: TourStep[];
}

export default function SpotlightTour({ isOpen, onClose, steps = DEFAULT_TOUR_STEPS }: SpotlightTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [cardPosition, setCardPosition] = useState<CardPosition | null>(null);
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  // Find and measure target element
  useEffect(() => {
    if (!isOpen || !step.targetSelector) {
      setTargetRect(null);
      return;
    }

    const findAndMeasureTarget = () => {
      const element = document.querySelector(step.targetSelector!);
      if (!element) {
        console.warn(`Tour target not found: ${step.targetSelector}`);
        setTargetRect(null);
        return;
      }

      const rect = element.getBoundingClientRect();

      // Scroll into view if necessary
      if (rect.top < 0 || rect.bottom > window.innerHeight) {
        element.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' });
      }

      // Re-measure after scroll
      const finalRect = element.getBoundingClientRect();
      setTargetRect({
        top: finalRect.top,
        left: finalRect.left,
        width: finalRect.width,
        height: finalRect.height,
      });
    };

    // Wait a bit for scroll to complete
    const timer = setTimeout(findAndMeasureTarget, 100);
    return () => clearTimeout(timer);
  }, [isOpen, step.targetSelector, currentStep, prefersReducedMotion]);

  // Calculate card position
  useEffect(() => {
    if (!isOpen || !targetRect) {
      setCardPosition(null);
      return;
    }

    const cardWidth = 280;
    const cardHeight = 200;
    const padding = 16;
    const minMargin = 10;

    let placement: 'top' | 'bottom' | 'left' | 'right' = 'right';
    let top = 0;
    let left = 0;

    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;

    // Try placements in order: right, left, bottom, top
    const tryRight = targetRect.left + targetRect.width + padding + cardWidth < window.innerWidth - minMargin;
    const tryLeft = targetRect.left - padding - cardWidth > minMargin;
    const tryBottom = targetRect.top + targetRect.height + padding + cardHeight < window.innerHeight - minMargin;
    const tryTop = targetRect.top - padding - cardHeight > minMargin;

    if (tryRight) {
      placement = 'right';
      left = targetRect.left + targetRect.width + padding;
      top = targetCenterY - cardHeight / 2;
    } else if (tryLeft) {
      placement = 'left';
      left = targetRect.left - padding - cardWidth;
      top = targetCenterY - cardHeight / 2;
    } else if (tryBottom) {
      placement = 'bottom';
      top = targetRect.top + targetRect.height + padding;
      left = targetCenterX - cardWidth / 2;
    } else if (tryTop) {
      placement = 'top';
      top = targetRect.top - padding - cardHeight;
      left = targetCenterX - cardWidth / 2;
    } else {
      // Fallback: bottom center
      placement = 'bottom';
      top = window.innerHeight - cardHeight - 20;
      left = window.innerWidth / 2 - cardWidth / 2;
    }

    // Clamp to viewport
    left = Math.max(minMargin, Math.min(left, window.innerWidth - cardWidth - minMargin));
    top = Math.max(minMargin, Math.min(top, window.innerHeight - cardHeight - minMargin));

    setCardPosition({ top, left, placement });
  }, [isOpen, targetRect]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowRight') handleNext();
    if (e.key === 'ArrowLeft') handlePrevious();
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentStep]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (isOpen && step.targetSelector) {
        const element = document.querySelector(step.targetSelector);
        if (element) {
          const rect = element.getBoundingClientRect();
          setTargetRect({
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          });
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen, step.targetSelector]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
            className="fixed inset-0 bg-black/50 z-40 pointer-events-none"
            aria-hidden="true"
          />

          {/* Spotlight */}
          {targetRect && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
              className="fixed z-40 pointer-events-none"
              style={{
                top: Math.max(0, targetRect.top - 8),
                left: Math.max(0, targetRect.left - 8),
                width: targetRect.width + 16,
                height: targetRect.height + 16,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
                borderRadius: '8px',
                border: '2px solid rgba(59, 130, 246, 0.5)',
              }}
            />
          )}

          {/* Guide Card */}
          {cardPosition && (
            <motion.div
              initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.95 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
              className="fixed bg-white rounded-lg shadow-xl p-6 z-50 w-72"
              style={{
                top: `${cardPosition.top}px`,
                left: `${cardPosition.left}px`,
              }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="tour-title"
            >
              {/* Step counter */}
              <div className="text-sm text-gray-500 mb-3">
                {currentStep + 1} / {steps.length}
              </div>

              {/* Title */}
              <h2 id="tour-title" className="text-lg font-bold text-gray-900 mb-2">
                {step.title}
              </h2>

              {/* Description */}
              <p className="text-sm text-gray-600 mb-6 leading-relaxed">{step.text}</p>

              {/* Progress dots */}
              <div className="flex gap-1 mb-6">
                {steps.map((_: TourStep, idx: number) => (
                  <div
                    key={idx}
                    className={`h-1.5 w-1.5 rounded-full transition-colors ${
                      idx === currentStep
                        ? 'bg-blue-600'
                        : idx < currentStep
                          ? 'bg-blue-300'
                          : 'bg-gray-200'
                    }`}
                    aria-hidden="true"
                  />
                ))}
              </div>

              {/* Controls */}
              <div className="flex gap-2 justify-end">
                {currentStep > 0 && (
                  <button
                    onClick={handlePrevious}
                    className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-700 font-medium"
                    aria-label="Previous step"
                  >
                    ← Back
                  </button>
                )}

                <button
                  onClick={onClose}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-700 font-medium"
                  aria-label="Skip tour"
                >
                  Skip
                </button>

                {!isLastStep && (
                  <button
                    onClick={handleNext}
                    className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition"
                    aria-label="Next step"
                  >
                    Next
                  </button>
                )}

                {isLastStep && (
                  <button
                    onClick={onClose}
                    className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition"
                    aria-label="Finish tour"
                  >
                    Finish
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {/* Card without target (for welcome/finish steps) */}
          {!targetRect && (
            <motion.div
              initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.95 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 z-50 w-72"
              role="dialog"
              aria-modal="true"
              aria-labelledby="tour-title"
            >
              {/* Step counter */}
              <div className="text-sm text-gray-500 mb-3">
                {currentStep + 1} / {steps.length}
              </div>

              {/* Title */}
              <h2 id="tour-title" className="text-lg font-bold text-gray-900 mb-2">
                {step.title}
              </h2>

              {/* Description */}
              <p className="text-sm text-gray-600 mb-6 leading-relaxed">{step.text}</p>

              {/* Progress dots */}
              <div className="flex gap-1 mb-6 justify-center">
                {steps.map((_: TourStep, idx: number) => (
                  <div
                    key={idx}
                    className={`h-1.5 w-1.5 rounded-full transition-colors ${
                      idx === currentStep
                        ? 'bg-blue-600'
                        : idx < currentStep
                          ? 'bg-blue-300'
                          : 'bg-gray-200'
                    }`}
                    aria-hidden="true"
                  />
                ))}
              </div>

              {/* Controls */}
              <div className="flex gap-2 justify-end">
                {currentStep > 0 && (
                  <button
                    onClick={handlePrevious}
                    className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-700 font-medium"
                    aria-label="Previous step"
                  >
                    ← Back
                  </button>
                )}

                <button
                  onClick={onClose}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-700 font-medium"
                  aria-label="Skip tour"
                >
                  Skip
                </button>

                {!isLastStep && (
                  <button
                    onClick={handleNext}
                    className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition"
                    aria-label="Next step"
                  >
                    Next
                  </button>
                )}

                {isLastStep && (
                  <button
                    onClick={onClose}
                    className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition"
                    aria-label="Finish tour"
                  >
                    Finish
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}
