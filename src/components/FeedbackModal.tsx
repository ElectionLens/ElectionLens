import { useState, useCallback } from 'react';
import {
  X,
  Send,
  Bug,
  Lightbulb,
  Database,
  MessageSquare,
  Loader2,
  CheckCircle,
} from 'lucide-react';
import { submitFeedback, isFirebaseInitialized, type FeedbackType } from '../utils/firebase';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FEEDBACK_TYPES: {
  type: FeedbackType;
  label: string;
  icon: React.ReactNode;
  description: string;
}[] = [
  {
    type: 'bug',
    label: 'Bug Report',
    icon: <Bug size={20} />,
    description: 'Something is broken or not working',
  },
  {
    type: 'feature',
    label: 'Feature Request',
    icon: <Lightbulb size={20} />,
    description: 'Suggest a new feature',
  },
  {
    type: 'data_issue',
    label: 'Data Issue',
    icon: <Database size={20} />,
    description: 'Missing or incorrect election data',
  },
  {
    type: 'other',
    label: 'Other',
    icon: <MessageSquare size={20} />,
    description: 'General feedback or questions',
  },
];

export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps): JSX.Element | null {
  const [selectedType, setSelectedType] = useState<FeedbackType | null>(null);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const resetForm = useCallback(() => {
    setSelectedType(null);
    setMessage('');
    setEmail('');
    setStatus('idle');
    setErrorMessage('');
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  const handleSubmit = useCallback(async () => {
    if (!selectedType || !message.trim()) return;

    setStatus('submitting');
    setErrorMessage('');

    const result = await submitFeedback(selectedType, message.trim(), email.trim() || undefined);

    if (result.success) {
      setStatus('success');
      // Auto-close after success
      setTimeout(() => {
        handleClose();
      }, 2000);
    } else {
      setStatus('error');
      setErrorMessage(result.error || 'Failed to submit feedback');
    }
  }, [selectedType, message, email, handleClose]);

  if (!isOpen) return null;

  const firebaseReady = isFirebaseInitialized();

  return (
    <div className="feedback-modal-overlay" onClick={handleClose}>
      <div className="feedback-modal" onClick={(e) => e.stopPropagation()}>
        <div className="feedback-modal-header">
          <h2>Send Feedback</h2>
          <button className="feedback-modal-close" onClick={handleClose} title="Close">
            <X size={20} />
          </button>
        </div>

        {!firebaseReady ? (
          <div className="feedback-modal-content">
            <div className="feedback-unavailable">
              <MessageSquare size={48} />
              <p>Feedback system is currently unavailable.</p>
              <p className="feedback-unavailable-hint">
                Please email your feedback to <strong>feedback@electionlens.app</strong>
              </p>
            </div>
          </div>
        ) : status === 'success' ? (
          <div className="feedback-modal-content">
            <div className="feedback-success">
              <CheckCircle size={48} />
              <h3>Thank you!</h3>
              <p>Your feedback has been submitted successfully.</p>
            </div>
          </div>
        ) : (
          <div className="feedback-modal-content">
            {/* Type Selection */}
            <div className="feedback-section">
              <label className="feedback-label">What type of feedback?</label>
              <div className="feedback-type-grid">
                {FEEDBACK_TYPES.map(({ type, label, icon, description }) => (
                  <button
                    key={type}
                    className={`feedback-type-btn ${selectedType === type ? 'selected' : ''}`}
                    onClick={() => setSelectedType(type)}
                  >
                    <span className="feedback-type-icon">{icon}</span>
                    <span className="feedback-type-label">{label}</span>
                    <span className="feedback-type-desc">{description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Message */}
            <div className="feedback-section">
              <label className="feedback-label" htmlFor="feedback-message">
                Your message <span className="required">*</span>
              </label>
              <textarea
                id="feedback-message"
                className="feedback-textarea"
                placeholder={
                  selectedType === 'bug'
                    ? 'Please describe the bug and steps to reproduce it...'
                    : selectedType === 'feature'
                      ? 'Describe the feature you would like to see...'
                      : selectedType === 'data_issue'
                        ? 'Which constituency/election has incorrect or missing data?'
                        : 'Share your thoughts...'
                }
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
              />
            </div>

            {/* Email (optional) */}
            <div className="feedback-section">
              <label className="feedback-label" htmlFor="feedback-email">
                Email <span className="optional">(optional)</span>
              </label>
              <input
                id="feedback-email"
                type="email"
                className="feedback-input"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="feedback-hint">
                We&apos;ll only use this to follow up on your feedback
              </p>
            </div>

            {/* Error Message */}
            {status === 'error' && <div className="feedback-error">{errorMessage}</div>}

            {/* Submit Button */}
            <div className="feedback-actions">
              <button className="feedback-cancel-btn" onClick={handleClose}>
                Cancel
              </button>
              <button
                className="feedback-submit-btn"
                onClick={handleSubmit}
                disabled={!selectedType || !message.trim() || status === 'submitting'}
              >
                {status === 'submitting' ? (
                  <>
                    <Loader2 size={18} className="spinner" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send size={18} />
                    Submit Feedback
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
