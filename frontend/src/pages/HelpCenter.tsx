import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuickOverview } from '../hooks/useQuickOverview';
import MarkdownViewer from '../components/MarkdownViewer';
import FeedbackModal from '../components/FeedbackModal';
import * as api from '../services/api';

export interface HelpDocItem {
  id: string;
  slug: string;
  title: string;
  category: string;
  content: string;
  sourceFile: string;
  summary: string;
}

export default function HelpCenter() {
  const navigate = useNavigate();
  const { onReopenGuide } = useQuickOverview();
  const [docs, setDocs] = useState<HelpDocItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<HelpDocItem | null>(null);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'bug' | 'complaint' | 'feature' | 'suggestion' | 'support'>('suggestion');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchDocs = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.getHelpDocs();
        if (!cancelled && res.data?.data) {
          setDocs(res.data.data);
        }
      } catch (err: any) {
        if (!cancelled) {
          if (err.response?.status === 401) {
            setError('Your session has expired or authentication is required. Please log in to view documentation.');
          } else {
            setError(err.response?.data?.error || 'Failed to load help documentation');
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchDocs();
    return () => {
      cancelled = true;
    };
  }, []);

  // Handle ESC key to close article drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedDoc) {
        setSelectedDoc(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDoc]);

  const handleOpenAiAssistant = () => {
    window.dispatchEvent(new CustomEvent('commandcenter:open-ai-help'));
  };

  const filteredDocs = docs.filter((doc) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      doc.title.toLowerCase().includes(q) ||
      doc.category.toLowerCase().includes(q) ||
      doc.content.toLowerCase().includes(q) ||
      doc.summary.toLowerCase().includes(q)
    );
  });

  // Explicitly tracked documentation topics (both existing and planned)
  const plannedTopics = [
    {
      title: 'Goal Hierarchy & Governance Guide',
      category: 'Goals & Strategy',
      status: 'Coming Soon',
      summary: 'Creating company goals, linking parent/child objectives, setting review cadences, and managing goal evidence.',
    },
    {
      title: 'Account Security & Google OAuth Guide',
      category: 'Security & Auth',
      status: 'Coming Soon',
      summary: 'Setting up Google OAuth, managing verification OTPs, updating profile email/phone, and session revocation policies.',
    },
  ];

  const stripMarkdown = (text: string): string => {
    if (!text) return '';
    return text
      .replace(/\\(\*|_|#|-)/g, '$1')
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(`)(.*?)\1/g, '$2')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^[•\-\*]\s+/gm, '')
      .trim();
  };

  const highlightText = (text: string, query: string) => {
    if (!query.trim() || !text) return text;
    const parts = text.split(new RegExp(`(${query.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')})`, 'gi'));
    return (
      <span>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={i} className="bg-amber-200 text-slate-900 rounded px-1 font-semibold">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 bg-slate-50 min-h-screen">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 text-white p-8 rounded-2xl shadow-lg relative overflow-hidden">
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 bg-white/15 px-3 py-1 rounded-full text-xs font-medium backdrop-blur-xs">
            <span>📖 Official Documentation & Support</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">CommandCenter Help Center & How-to-Use</h1>
          <p className="text-blue-100 text-sm leading-relaxed">
            Find step-by-step guides, workflow instructions, system roles reference, and launch interactive walkthroughs.
          </p>

          {/* Search Bar */}
          <div className="pt-2 relative max-w-xl">
            <div className="relative flex items-center">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search guides, workflows, team roles, daily logging..."
                className="w-full pl-10 pr-10 py-3 rounded-xl text-slate-900 bg-white placeholder-slate-400 text-sm shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400 border border-slate-200"
              />
              <svg className="w-5 h-5 text-slate-400 absolute left-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 text-slate-400 hover:text-slate-600 p-1 text-sm font-bold"
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Instant Search Results Panel immediately below search field */}
            {searchQuery.trim() && (
              <div className="mt-3 bg-white rounded-xl p-4 shadow-xl border border-blue-200 text-slate-800 space-y-3 z-20 relative">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs font-bold text-slate-700">
                    Found {filteredDocs.length} matching guide{filteredDocs.length === 1 ? '' : 's'}
                  </span>
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
                  >
                    Clear Search
                  </button>
                </div>
                {filteredDocs.length === 0 ? (
                  <div className="text-xs text-slate-500 py-2">
                    No articles match "{searchQuery}". Try searching for broader terms like "task" or "team".
                  </div>
                ) : (
                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                    {filteredDocs.map((doc) => (
                      <div
                        key={doc.id}
                        onClick={() => setSelectedDoc(doc)}
                        className="p-2.5 rounded-lg hover:bg-blue-50 cursor-pointer transition-colors border border-transparent hover:border-blue-200 flex items-start justify-between gap-3"
                      >
                        <div>
                          <div className="text-xs font-bold text-slate-900">
                            {highlightText(doc.title, searchQuery)}
                          </div>
                          <div className="text-xs text-slate-600 line-clamp-1 mt-0.5">
                            {highlightText(doc.summary || stripMarkdown(doc.content).slice(0, 100), searchQuery)}
                          </div>
                        </div>
                        <span className="text-xs font-semibold px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full shrink-0">
                          {doc.category}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Prominent How to Use Quick Launchers */}
      <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <span>🚀 How to Use CommandCenter — Quick Tools</span>
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setFeedbackType('suggestion');
                setIsFeedbackOpen(true);
              }}
              className="btn-primary text-xs px-3.5 py-2 flex items-center gap-1.5 shadow-xs"
            >
              <span>💬 Submit Feedback / Bug Report</span>
            </button>
            <button
              onClick={() => navigate('/my-feedback')}
              className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-lg text-xs px-3.5 py-2 transition-colors border border-slate-300"
            >
              <span>📋 My Reports</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: Spotlight Tour */}
          <motion.div
            whileHover={{ y: -3 }}
            className="bg-white p-6 rounded-xl border border-slate-200 border-l-4 border-l-blue-600 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-lg">
                🎬
              </div>
              <h3 className="font-bold text-slate-900 text-base">Take Guided Feature Tour</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Launch the step-by-step interactive walkthrough showcasing primary workspace features and navigation targets.
              </p>
            </div>
            <button
              onClick={onReopenGuide}
              className="mt-5 btn-primary text-xs py-2 w-full flex items-center justify-center gap-2"
            >
              <span>Start Interactive Tour</span>
              <span>&rarr;</span>
            </button>
          </motion.div>

          {/* Card 2: AI Assistant */}
          <motion.div
            whileHover={{ y: -3 }}
            className="bg-white p-6 rounded-xl border border-slate-200 border-l-4 border-l-indigo-600 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-lg">
                🤖
              </div>
              <h3 className="font-bold text-slate-900 text-base">Ask AI Copilot</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Ask our AI assistant questions directly. RAG tools retrieve live feature knowledge and answers for you.
              </p>
            </div>
            <button
              onClick={handleOpenAiAssistant}
              className="mt-5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-xs py-2 w-full transition-colors flex items-center justify-center gap-2"
            >
              <span>Open AI Help Chat</span>
              <span>💬</span>
            </button>
          </motion.div>

          {/* Card 3: SOS Hub */}
          <motion.div
            whileHover={{ y: -3 }}
            className="bg-white p-6 rounded-xl border border-slate-200 border-l-4 border-l-amber-600 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-lg">
                🚨
              </div>
              <h3 className="font-bold text-slate-900 text-base">SOS Blocker Help Hub</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Stuck on a task or blocker? Post guidance requests to team leads and peers on the active SOS Hub.
              </p>
            </div>
            <button
              onClick={() => navigate('/help')}
              className="mt-5 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg text-xs py-2 w-full transition-colors flex items-center justify-center gap-2"
            >
              <span>Go to SOS Hub</span>
              <span>&rarr;</span>
            </button>
          </motion.div>
        </div>
      </section>

      {/* Main Documentation Articles Grid */}
      <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
          <span>📚 Product Documentation & Guides</span>
        </h2>

        {error && (
          <div className="alert alert-error bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[1, 2].map((n) => (
              <div key={n} className="bg-white p-6 rounded-xl border border-slate-200 space-y-3 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-1/4"></div>
                <div className="h-6 bg-slate-200 rounded w-3/4"></div>
                <div className="h-4 bg-slate-200 rounded w-full"></div>
                <div className="h-4 bg-slate-200 rounded w-2/3"></div>
              </div>
            ))}
          </div>
        ) : filteredDocs.length === 0 && searchQuery ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 p-8 space-y-3">
            <div className="text-3xl">🔍</div>
            <h3 className="text-lg font-bold text-slate-900">No articles found matching "{searchQuery}"</h3>
            <p className="text-sm text-slate-500">Try searching for broader terms like "task", "team", or "review".</p>
            <button
              onClick={() => setSearchQuery('')}
              className="btn-primary text-xs px-4 py-2 mt-2"
            >
              Clear Search
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Available Official Documentation Articles */}
            {filteredDocs.map((doc) => (
              <motion.div
                key={doc.id}
                whileHover={{ y: -2 }}
                className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-blue-400 transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-100">
                      {doc.category}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">{doc.sourceFile}</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">{highlightText(doc.title, searchQuery)}</h3>
                  <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                    {highlightText(doc.summary || stripMarkdown(doc.content).slice(0, 180), searchQuery)}...
                  </p>
                </div>
                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-500">Single Source of Truth</span>
                  <button
                    onClick={() => setSelectedDoc(doc)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1"
                  >
                    <span>Read Full Guide</span>
                    <span>&rarr;</span>
                  </button>
                </div>
              </motion.div>
            ))}

            {/* Planned Documentation Topics (Explicitly Marked) */}
            {!searchQuery &&
              plannedTopics.map((topic, idx) => (
                <div
                  key={idx}
                  className="bg-white p-6 rounded-xl border border-dashed border-slate-300 shadow-xs hover:shadow-sm flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full border border-slate-200">
                        {topic.category}
                      </span>
                      <span className="text-xs font-semibold px-2.5 py-0.5 bg-amber-50 text-amber-800 rounded-full border border-amber-200">
                        {topic.status}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">{topic.title}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed">{topic.summary}</p>
                  </div>
                  <div className="pt-4 mt-4 border-t border-slate-200 text-xs text-slate-400 italic">
                    Documentation guide pending creation
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>

      {/* Article Reader Drawer / Modal */}
      <AnimatePresence>
        {selectedDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-gray-200"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded-full">
                    {selectedDoc.category}
                  </span>
                  <h2 className="text-xl font-bold text-gray-900 mt-2">{selectedDoc.title}</h2>
                </div>
                <button
                  onClick={() => setSelectedDoc(null)}
                  className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-200 transition-colors text-lg font-bold"
                  aria-label="Close article"
                >
                  ✕
                </button>
              </div>

              {/* Modal Content Reader */}
              <div className="p-6 overflow-y-auto space-y-4 text-sm text-gray-800 leading-relaxed">
                <MarkdownViewer content={selectedDoc.content} />
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
                <span>Source: {selectedDoc.sourceFile}</span>
                <button
                  onClick={() => setSelectedDoc(null)}
                  className="btn-primary text-xs px-4 py-2"
                >
                  Close Reader
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* User Support & Feedback Modal */}
      <FeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
        defaultType={feedbackType}
      />
    </div>
  );
}
