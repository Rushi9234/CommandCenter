import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface WalkthroughCard {
  title: string;
  text: string;
  icon?: string;
}

const WALKTHROUGH_CARDS: WalkthroughCard[] = [
  {
    title: 'Welcome to CommandCenter',
    text: "Your team's space for goals, projects, communication, and progress.",
    icon: '👋',
  },
  {
    title: 'Start with Work Activity',
    text: 'See what needs your attention and share your daily progress.',
    icon: '📊',
  },
  {
    title: 'Find Your People',
    text: 'Join teams, manage classes, and organize your workspace.',
    icon: '👥',
  },
  {
    title: 'Set the Direction',
    text: 'Create goals, track progress, and move work through approval.',
    icon: '🎯',
  },
  {
    title: 'Turn Goals into Work',
    text: 'Break goals into projects and actionable tasks.',
    icon: '✅',
  },
  {
    title: 'Talk. Plan. Collaborate.',
    text: 'Message one person privately or bring your whole team into the conversation.',
    icon: '💬',
  },
  {
    title: 'Stuck? Surface It.',
    text: 'Raise blockers, get attention, and keep work moving.',
    icon: '🚧',
  },
  {
    title: 'See Your Impact',
    text: 'Track contribution, compare progress, and see how your work adds up.',
    icon: '📈',
  },
  {
    title: 'Stay in the Loop',
    text: 'Get the updates that matter without constantly checking every page.',
    icon: '🔔',
  },
  {
    title: "You're Ready",
    text: 'Check your team. See your goals. Get to work.',
    icon: '🚀',
  },
];

interface QuickOverviewProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function QuickOverview({ isOpen, onClose }: QuickOverviewProps) {
  const [currentCard, setCurrentCard] = useState(0);
  const isLastCard = currentCard === WALKTHROUGH_CARDS.length - 1;

  const handleNext = () => {
    if (currentCard < WALKTHROUGH_CARDS.length - 1) {
      setCurrentCard(currentCard + 1);
    }
  };

  const handlePrevious = () => {
    if (currentCard > 0) {
      setCurrentCard(currentCard - 1);
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
  }, [isOpen, currentCard]);

  const card = WALKTHROUGH_CARDS[currentCard];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={onClose}
          role="presentation"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-lg max-w-md w-full p-8 shadow-lg"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="overview-title"
          >
            {/* Progress indicator */}
            <div className="flex justify-between items-center mb-8">
              <div className="text-sm text-gray-500">
                {currentCard + 1} / {WALKTHROUGH_CARDS.length}
              </div>
              <div className="flex gap-1">
                {WALKTHROUGH_CARDS.map((_, idx) => (
                  <div
                    key={idx}
                    className={`h-2 w-2 rounded-full ${
                      idx === currentCard
                        ? 'bg-blue-600'
                        : idx < currentCard
                          ? 'bg-blue-300'
                          : 'bg-gray-200'
                    }`}
                    aria-hidden="true"
                  />
                ))}
              </div>
            </div>

            {/* Card content */}
            <div className="text-center mb-8">
              {card.icon && (
                <div className="text-5xl mb-4" aria-hidden="true">
                  {card.icon}
                </div>
              )}
              <h2 id="overview-title" className="text-2xl font-bold text-gray-900 mb-4">
                {card.title}
              </h2>
              <p className="text-gray-600 text-base leading-relaxed">{card.text}</p>
            </div>

            {/* Controls */}
            <div className="flex gap-3">
              {currentCard > 0 && (
                <button
                  onClick={handlePrevious}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition"
                  aria-label="Previous card"
                >
                  ← Previous
                </button>
              )}

              {!isLastCard && (
                <>
                  <button
                    onClick={onClose}
                    className="flex-1 px-4 py-2 text-gray-600 hover:text-gray-700 font-medium"
                    aria-label="Skip walkthrough"
                  >
                    Skip
                  </button>
                  <button
                    onClick={handleNext}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
                    aria-label="Next card"
                  >
                    Next →
                  </button>
                </>
              )}

              {isLastCard && (
                <button
                  onClick={onClose}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
                  aria-label="Finish walkthrough and explore CommandCenter"
                >
                  Explore CommandCenter 🚀
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
