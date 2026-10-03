import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as api from '../services/api';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: 'bug' | 'complaint' | 'feature' | 'suggestion' | 'support';
  onSubmitted?: (referenceId: string) => void;
}

export default function FeedbackModal({ isOpen, onClose, defaultType = 'suggestion', onSubmitted }: FeedbackModalProps) {
  const [reportType, setReportType] = useState<'bug' | 'complaint' | 'feature' | 'suggestion' | 'support'>(defaultType);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [affectedPage, setAffectedPage] = useState(window.location.pathname);
  const [expectedBehavior, setExpectedBehavior] = useState('');
  const [actualBehavior, setActualBehavior] = useState('');
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [contactPreference, setContactPreference] = useState<'in_app' | 'email' | 'none'>('in_app');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successRefId, setSuccessRefId] = useState<string | null>(null);
  const [successDeliveryStatus, setSuccessDeliveryStatus] = useState<string>('saved_locally');
  const [copied, setCopied] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError(null);
    setError(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      setFileError('Unsupported file type. Please upload a PNG, JPEG, WEBP, or PDF file.');
      setSelectedFile(null);
      return;
    }

    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
    if (file.size > MAX_SIZE) {
      setFileError('File size exceeds the 5 MB limit. Please select a smaller file.');
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setFileError(null);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64Data = result.split(',')[1] || '';
        resolve(base64Data);
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (subject.trim().length < 3) {
      setError('Subject must be at least 3 characters long.');
      return;
    }

    if (description.trim().length < 10) {
      setError('Description must be at least 10 characters long.');
      return;
    }

    if (fileError) {
      setError(fileError);
      return;
    }

    setSubmitting(true);

    try {
      let attachmentPayload: { filename: string; content: string; contentType: string; size: number } | undefined;
      if (selectedFile) {
        const base64Content = await fileToBase64(selectedFile);
        attachmentPayload = {
          filename: selectedFile.name,
          content: base64Content,
          contentType: selectedFile.type,
          size: selectedFile.size,
        };
      }

      const res = await api.createFeedback({
        report_type: reportType,
        subject,
        description,
        affected_page: affectedPage,
        expected_behavior: expectedBehavior,
        actual_behavior: actualBehavior,
        severity,
        contact_preference: contactPreference,
        attachment_url: attachmentUrl,
        attachment: attachmentPayload,
      });

      if (res.data?.data?.reference_id) {
        const refId = res.data.data.reference_id;
        const status = res.data.data.delivery_status || 'saved_locally';
        setSuccessRefId(refId);
        setSuccessDeliveryStatus(status);
        if (onSubmitted) onSubmitted(refId);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit feedback report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyRef = () => {
    if (successRefId) {
      navigator.clipboard.writeText(successRefId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleReset = () => {
    setSuccessRefId(null);
    setCopied(false);
    setSubject('');
    setDescription('');
    setExpectedBehavior('');
    setActualBehavior('');
    setAttachmentUrl('');
    setSelectedFile(null);
    setFileError(null);
    setError(null);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200"
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded-full">
                  User Support & Feedback
                </span>
                <h2 className="text-xl font-bold text-slate-900 mt-1">Submit Feedback or Issue Report</h2>
              </div>
              <button
                onClick={handleReset}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-200 transition-colors text-lg font-bold"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-sm text-slate-800">
              {successRefId ? (
                <div className="text-center py-8 space-y-4">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-3xl font-bold">
                    ✓
                  </div>
                  <h3 className="text-2xl font-extrabold text-slate-900">Thank You! Report Submitted</h3>
                  <p className="text-slate-600 max-w-md mx-auto">
                    Your report has been recorded. Reference ID:
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <span className="font-mono text-lg font-bold bg-slate-100 border border-slate-300 text-slate-900 px-4 py-2 rounded-xl">
                      {successRefId}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyRef}
                      className="bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold px-3 py-2 rounded-xl transition-colors flex items-center gap-1"
                    >
                      {copied ? '✓ Copied' : '📋 Copy ID'}
                    </button>
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${
                      successDeliveryStatus === 'email_delivered'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-slate-100 text-slate-700 border-slate-300'
                    }`}>
                      {successDeliveryStatus === 'email_delivered' ? '📧 Ticket Emailed to Support' : '💾 Report Saved Locally'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 pt-2">
                    You can view the status of all your submitted reports under <span className="font-semibold text-slate-700">My Support Reports</span>.
                  </p>
                  <div className="pt-4 flex justify-center gap-3">
                    <button onClick={handleReset} className="btn-primary text-xs px-6 py-2.5">
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && (
                    <div className="alert alert-error bg-red-50 border border-red-200 text-red-800 p-3 rounded-xl text-xs">
                      {error}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Report Type */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Report Type <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={reportType}
                        onChange={(e) => setReportType(e.target.value as any)}
                        className="w-full input-field text-xs py-2 bg-white border border-slate-300 rounded-lg"
                      >
                        <option value="bug">🐛 Bug Report</option>
                        <option value="complaint">⚠️ Complaint</option>
                        <option value="feature">💡 Feature Request</option>
                        <option value="suggestion">💭 Suggestion</option>
                        <option value="support">🎧 Contact Support</option>
                      </select>
                    </div>

                    {/* Severity */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Severity / Priority
                      </label>
                      <select
                        value={severity}
                        onChange={(e) => setSeverity(e.target.value as any)}
                        className="w-full input-field text-xs py-2 bg-white border border-slate-300 rounded-lg"
                      >
                        <option value="low">Low (Minor cosmetic issue)</option>
                        <option value="medium">Medium (Standard feedback)</option>
                        <option value="high">High (Feature impaired)</option>
                        <option value="critical">Critical (Blocking workflow)</option>
                      </select>
                    </div>
                  </div>

                  {/* Subject */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Subject <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Brief summary of your feedback or issue"
                      className="input-field text-xs w-full"
                      required
                    />
                  </div>

                  {/* Affected Page */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Affected Page / Feature
                    </label>
                    <input
                      type="text"
                      value={affectedPage}
                      onChange={(e) => setAffectedPage(e.target.value)}
                      placeholder="e.g. /goals or Projects Page"
                      className="input-field text-xs w-full"
                    />
                  </div>

                  {/* Bug specific fields */}
                  {reportType === 'bug' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Expected Behavior
                        </label>
                        <textarea
                          value={expectedBehavior}
                          onChange={(e) => setExpectedBehavior(e.target.value)}
                          placeholder="What did you expect to happen?"
                          rows={2}
                          className="input-field text-xs w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Actual Behavior
                        </label>
                        <textarea
                          value={actualBehavior}
                          onChange={(e) => setActualBehavior(e.target.value)}
                          placeholder="What actually happened?"
                          rows={2}
                          className="input-field text-xs w-full"
                        />
                      </div>
                    </div>
                  )}

                  {/* Detailed Description */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Detailed Description <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Provide details, steps to reproduce, or suggestions..."
                      rows={4}
                      className="input-field text-xs w-full"
                      required
                    />
                  </div>

                  {/* Supporting File Attachment */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Attach Screenshot or Supporting File (Optional)
                    </label>
                    {selectedFile ? (
                      <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs">
                        <div className="flex items-center gap-2 truncate">
                          <span>📎</span>
                          <span className="font-semibold text-slate-800 truncate">{selectedFile.name}</span>
                          <span className="text-slate-500 font-mono">({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleRemoveFile}
                          className="text-rose-600 hover:text-rose-800 font-bold px-2 py-0.5 rounded hover:bg-rose-50 transition-colors"
                        >
                          ✕ Remove
                        </button>
                      </div>
                    ) : (
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,application/pdf"
                        onChange={handleFileChange}
                        className="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                      />
                    )}
                    {fileError && (
                      <p className="text-[11px] text-rose-600 mt-1">{fileError}</p>
                    )}
                    <p className="text-[10px] text-slate-400 mt-1">Supported formats: PNG, JPEG, WEBP, PDF (Max 5 MB)</p>
                  </div>

                  {/* Contact Preference */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Contact Preference
                    </label>
                    <select
                      value={contactPreference}
                      onChange={(e) => setContactPreference(e.target.value as any)}
                      className="w-full input-field text-xs py-2 bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="in_app">In-App Notification</option>
                      <option value="email">Email</option>
                      <option value="none">Do not contact</option>
                    </select>
                  </div>

                  {/* Modal Action Buttons */}
                  <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={handleReset}
                      className="px-4 py-2 text-xs text-slate-600 hover:text-slate-800 font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="btn-primary text-xs px-6 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? 'Submitting...' : 'Submit Report'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
