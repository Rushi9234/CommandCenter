import { useState, useEffect, useCallback, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UNSAFE_NavigationContext, useNavigate, useLocation } from 'react-router-dom';

export interface TourStep {
  id: string;
  badge?: string;
  title: string;
  text: string;
  route?: string;
  targetSelector?: string;
}

export const DEFAULT_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    badge: 'WELCOME',
    title: 'Welcome to CommandCenter',
    text: "Your team's space for goals, projects, and progress.",
    route: '/pulse',
  },
  {
    id: 'pulse',
    badge: 'WORK ACTIVITY',
    title: 'Start with Work Activity',
    text: 'See what needs your attention and share your daily progress.',
    route: '/pulse',
    targetSelector: '[data-tour-target="pulse"]',
  },
  {
    id: 'teams',
    badge: 'TEAMS',
    title: 'Find Your People',
    text: 'Join teams, manage classes, and organize your workspace.',
    route: '/teams',
    targetSelector: '[data-tour-target="teams"]',
  },
  {
    id: 'goals',
    badge: 'GOALS',
    title: 'Set the Direction',
    text: 'Create goals, track progress, and move work through approval.',
    route: '/goals',
    targetSelector: '[data-tour-target="goals"]',
  },
  {
    id: 'projects',
    badge: 'PROJECTS',
    title: 'Turn Goals into Work',
    text: 'Break goals into projects and actionable tasks.',
    route: '/projects',
    targetSelector: '[data-tour-target="projects"]',
  },
  {
    id: 'sos-hub',
    badge: 'SOS HUB',
    title: 'Stuck? Surface It.',
    text: 'Raise blockers, get attention, and keep work moving.',
    route: '/help',
    targetSelector: '[data-tour-target="sos-hub"]',
  },
  {
    id: 'leaderboard',
    badge: 'ACHIEVEMENTS',
    title: 'See Your Impact',
    text: 'Track contribution, compare progress, and see how your work adds up.',
    route: '/leaderboard',
    targetSelector: '[data-tour-target="leaderboard"]',
  },
  {
    id: 'analytics',
    badge: 'ANALYTICS',
    title: 'Understand the Bigger Picture',
    text: 'Use team insights and analytics to understand progress and activity.',
    route: '/analytics',
    targetSelector: '[data-tour-target="analytics"]',
  },
  {
    id: 'chat',
    badge: 'WORKSPACE',
    title: 'Chat',
    text: 'Message teammates directly or communicate in your team chats.',
    route: '/chat',
    targetSelector: '[data-tour-target="chat"]',
  },
  {
    id: 'notifications',
    badge: 'UPDATES',
    title: 'Stay in the Loop',
    text: 'Get the updates that matter without constantly checking every page.',
    route: '/pulse',
    targetSelector: '[data-tour-target="notifications"]',
  },
  {
    id: 'profile',
    badge: 'SETTINGS',
    title: 'Your Account',
    text: 'Manage your profile, account details, and security from one place.',
    route: '/pulse',
    targetSelector: '[data-tour-target="profile"]',
  },
  {
    id: 'finish',
    badge: 'GET STARTED',
    title: "You're Ready 🚀",
    text: 'Check your team. See your goals. Get to work.',
    route: '/pulse',
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

interface RouterBridgeProps {
  onRouteState: (navigate: (path: string) => void, pathname: string) => void;
}

function SafeRouterBridge({ onRouteState }: RouterBridgeProps) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    onRouteState(navigate, location.pathname);
  }, [navigate, location.pathname, onRouteState]);

  return null;
}

export default function SpotlightTour({ isOpen, onClose, steps = DEFAULT_TOUR_STEPS }: SpotlightTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [cardPosition, setCardPosition] = useState<CardPosition | null>(null);
  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const navContext = useContext(UNSAFE_NavigationContext);
  const isInsideRouter = Boolean(navContext && (navContext as any).navigator);

  const [routerNav, setRouterNav] = useState<((path: string) => void) | null>(null);
  const [currentPathname, setCurrentPathname] = useState<string>('');

  const handleRouteState = useCallback((nav: (path: string) => void, pathname: string) => {
    setRouterNav(() => nav);
    setCurrentPathname(pathname);
  }, []);

  const step = steps[currentStep] || steps[0];
  const isLastStep = currentStep === steps.length - 1;

  // Reset step counter and sync route when tour opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
      const firstStep = steps[0];
      if (routerNav && firstStep?.route && currentPathname !== firstStep.route) {
        routerNav(firstStep.route);
      }
    }
  }, [isOpen]);

  // Find, poll, and measure target element
  useEffect(() => {
    if (!isOpen || !step.targetSelector) {
      setTargetRect(null);
      return;
    }

    let isMounted = true;
    let attempts = 0;
    const maxAttempts = 30; // 30 * 50ms = 1500ms

    const findAndMeasureTarget = () => {
      if (!isMounted) return;
      const element = document.querySelector(step.targetSelector!);
      if (!element) {
        if (attempts < maxAttempts) {
          attempts++;
          setTimeout(findAndMeasureTarget, 50);
        } else {
          setTargetRect(null);
        }
        return;
      }

      const rect = element.getBoundingClientRect();
      const isVisibleInViewport =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.top < window.innerHeight &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.right > 0;

      if (!isVisibleInViewport) {
        element.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'nearest' });
      }

      const finalRect = element.getBoundingClientRect();
      const isFinalVisible =
        finalRect.width > 0 &&
        finalRect.height > 0 &&
        finalRect.right > 0 &&
        finalRect.bottom > 0 &&
        finalRect.left < window.innerWidth &&
        finalRect.top < window.innerHeight;

      if (!isFinalVisible) {
        setTargetRect(null);
        return;
      }

      setTargetRect({
        top: finalRect.top,
        left: finalRect.left,
        width: finalRect.width,
        height: finalRect.height,
      });
    };

    const timer = setTimeout(findAndMeasureTarget, 50);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [isOpen, step.targetSelector, currentStep, prefersReducedMotion]);

  // Calculate card position
  useEffect(() => {
    if (!isOpen || !targetRect) {
      setCardPosition(null);
      return;
    }

    const cardWidth = 340;
    const cardHeight = 230;
    const padding = 16;
    const minMargin = 16;

    let placement: 'top' | 'bottom' | 'left' | 'right' = 'right';
    let top = 0;
    let left = 0;

    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;

    const isSidebarTarget = targetRect.left < 260 && window.innerWidth >= 1024;

    if (isSidebarTarget) {
      placement = 'right';
      left = Math.max(272, targetRect.left + targetRect.width + padding);
      top = targetCenterY - cardHeight / 2;
    } else {
      const tryRight = targetRect.left + targetRect.width + padding + cardWidth < window.innerWidth - minMargin;
      const tryLeft = targetRect.left - padding - cardWidth > minMargin;
      const tryBottom = targetRect.top + targetRect.height + padding + cardHeight < window.innerHeight - minMargin;
      const tryTop = targetRect.top - padding - cardHeight > minMargin;

      if (tryRight) {
        placement = 'right';
        left = targetRect.left + targetRect.width + padding;
        top = targetCenterY - cardHeight / 2;
      } else if (tryBottom) {
        placement = 'bottom';
        top = targetRect.top + targetRect.height + padding;
        left = targetCenterX - cardWidth / 2;
      } else if (tryLeft) {
        placement = 'left';
        left = targetRect.left - padding - cardWidth;
        top = targetCenterY - cardHeight / 2;
      } else if (tryTop) {
        placement = 'top';
        top = targetRect.top - padding - cardHeight;
        left = targetCenterX - cardWidth / 2;
      } else {
        placement = 'bottom';
        top = window.innerHeight - cardHeight - 20;
        left = window.innerWidth / 2 - cardWidth / 2;
      }
    }

    // Clamp strictly to visible viewport boundaries
    left = Math.max(minMargin, Math.min(left, window.innerWidth - cardWidth - minMargin));
    top = Math.max(minMargin, Math.min(top, window.innerHeight - cardHeight - minMargin));

    setCardPosition({ top, left, placement });
  }, [isOpen, targetRect]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      const nextStep = steps[currentStep + 1];
      if (routerNav && nextStep.route && currentPathname !== nextStep.route) {
        routerNav(nextStep.route);
      }
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      const prevStep = steps[currentStep - 1];
      if (routerNav && prevStep.route && currentPathname !== prevStep.route) {
        routerNav(prevStep.route);
      }
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

  // Handle window resize and scroll
  useEffect(() => {
    const handleUpdate = () => {
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

    window.addEventListener('resize', handleUpdate);
    window.addEventListener('scroll', handleUpdate, true);
    return () => {
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('scroll', handleUpdate, true);
    };
  }, [isOpen, step.targetSelector]);

  return (
    <>
      {isInsideRouter && <SafeRouterBridge onRouteState={handleRouteState} />}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px] z-[9990] pointer-events-none"
              aria-hidden="true"
            />

            {/* Spotlight Glow Ring */}
            {targetRect && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
                className="fixed z-[9995] pointer-events-none transition-all duration-300"
                style={{
                  top: Math.max(0, targetRect.top - 6),
                  left: Math.max(0, targetRect.left - 6),
                  width: targetRect.width + 12,
                  height: targetRect.height + 12,
                  borderRadius: '12px',
                  border: '2px solid #2563eb',
                  boxShadow: '0 0 0 4px rgba(37, 99, 235, 0.25), 0 0 20px rgba(37, 99, 235, 0.35)',
                }}
              />
            )}

            {/* Guide Card (With Target Element) */}
            {cardPosition && (
              <motion.div
                initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.95 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
                className="fixed bg-white rounded-2xl shadow-2xl p-6 z-[10000] w-[340px] border border-slate-200"
                style={{
                  top: `${cardPosition.top}px`,
                  left: `${cardPosition.left}px`,
                }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="tour-title"
              >
                {/* Header: Badge & Close Button */}
                <div className="flex items-center justify-between mb-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100 uppercase tracking-wider">
                    {step.badge || `STEP ${currentStep + 1} OF ${steps.length}`}
                  </span>
                  <button
                    onClick={onClose}
                    className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1 rounded-lg transition-colors"
                    aria-label="Close tour"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Step counter */}
                <div className="text-xs text-slate-400 mb-2">
                  {currentStep + 1} / {steps.length}
                </div>

                {/* Title */}
                <h2 id="tour-title" className="text-lg font-bold text-slate-900 mb-2 leading-snug">
                  {step.title}
                </h2>

                {/* Description */}
                <p className="text-sm text-slate-600 mb-5 leading-relaxed">{step.text}</p>

                {/* Progress Dots */}
                <div className="flex gap-1 items-center mb-5">
                  {steps.map((_: TourStep, idx: number) => (
                    <div
                      key={idx}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        idx === currentStep
                          ? 'w-5 bg-blue-600'
                          : idx < currentStep
                            ? 'w-1.5 bg-blue-300'
                            : 'w-1.5 bg-slate-200'
                      }`}
                      aria-hidden="true"
                    />
                  ))}
                </div>

                {/* Controls */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <button
                    onClick={onClose}
                    className="px-2 py-1 text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
                    aria-label="Skip tour"
                  >
                    Skip
                  </button>

                  <div className="flex items-center gap-2">
                    {currentStep > 0 && (
                      <button
                        onClick={handlePrevious}
                        className="px-3.5 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors shadow-2xs"
                        aria-label="Previous step"
                      >
                        ← Back
                      </button>
                    )}

                    {!isLastStep && (
                      <button
                        onClick={handleNext}
                        className="px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors shadow-xs"
                        aria-label="Next step"
                      >
                        Next
                      </button>
                    )}

                    {isLastStep && (
                      <button
                        onClick={onClose}
                        className="px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors shadow-xs"
                        aria-label="Finish tour"
                      >
                        Finish
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Centered Guide Card (When no target element, e.g. Welcome / Finish) */}
            {!targetRect && (
              <motion.div
                initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.95 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl p-6 z-[10000] w-[340px] border border-slate-200"
                role="dialog"
                aria-modal="true"
                aria-labelledby="tour-title"
              >
                {/* Header: Badge & Close Button */}
                <div className="flex items-center justify-between mb-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100 uppercase tracking-wider">
                    {step.badge || `STEP ${currentStep + 1} OF ${steps.length}`}
                  </span>
                  <button
                    onClick={onClose}
                    className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1 rounded-lg transition-colors"
                    aria-label="Close tour"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Step counter */}
                <div className="text-xs text-slate-400 mb-2">
                  {currentStep + 1} / {steps.length}
                </div>

                {/* Title */}
                <h2 id="tour-title" className="text-lg font-bold text-slate-900 mb-2 leading-snug">
                  {step.title}
                </h2>

                {/* Description */}
                <p className="text-sm text-slate-600 mb-5 leading-relaxed">{step.text}</p>

                {/* Progress Dots */}
                <div className="flex gap-1 items-center justify-center mb-5">
                  {steps.map((_: TourStep, idx: number) => (
                    <div
                      key={idx}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        idx === currentStep
                          ? 'w-5 bg-blue-600'
                          : idx < currentStep
                            ? 'w-1.5 bg-blue-300'
                            : 'w-1.5 bg-slate-200'
                      }`}
                      aria-hidden="true"
                    />
                  ))}
                </div>

                {/* Controls */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <button
                    onClick={onClose}
                    className="px-2 py-1 text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
                    aria-label="Skip tour"
                  >
                    Skip
                  </button>

                  <div className="flex items-center gap-2">
                    {currentStep > 0 && (
                      <button
                        onClick={handlePrevious}
                        className="px-3.5 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors shadow-2xs"
                        aria-label="Previous step"
                      >
                        ← Back
                      </button>
                    )}

                    {!isLastStep && (
                      <button
                        onClick={handleNext}
                        className="px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors shadow-xs"
                        aria-label="Next step"
                      >
                        Next
                      </button>
                    )}

                    {isLastStep && (
                      <button
                        onClick={onClose}
                        className="px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors shadow-xs"
                        aria-label="Finish tour"
                      >
                        Finish
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </>
        )}
      </AnimatePresence>
    </>
  );
}
