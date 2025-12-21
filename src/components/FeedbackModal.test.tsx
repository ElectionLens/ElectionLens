import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FeedbackModal } from './FeedbackModal';

// Mock Firebase utilities
vi.mock('../utils/firebase', () => ({
  submitFeedback: vi.fn(),
  isFirebaseInitialized: vi.fn(),
}));

import { submitFeedback, isFirebaseInitialized } from '../utils/firebase';

describe('FeedbackModal', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isFirebaseInitialized).mockReturnValue(true);
  });

  describe('rendering', () => {
    it('renders nothing when closed', () => {
      const { container } = render(<FeedbackModal isOpen={false} onClose={mockOnClose} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders modal when open', () => {
      render(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByText('Send Feedback')).toBeInTheDocument();
    });

    it('renders all feedback type options', () => {
      render(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByText('Bug Report')).toBeInTheDocument();
      expect(screen.getByText('Feature Request')).toBeInTheDocument();
      expect(screen.getByText('Data Issue')).toBeInTheDocument();
      expect(screen.getByText('Other')).toBeInTheDocument();
    });

    it('renders message textarea', () => {
      render(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByRole('textbox', { name: /your message/i })).toBeInTheDocument();
    });

    it('renders email input', () => {
      render(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
    });

    it('renders submit button', () => {
      render(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByRole('button', { name: /submit feedback/i })).toBeInTheDocument();
    });

    it('renders cancel button', () => {
      render(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });
  });

  describe('Firebase not initialized', () => {
    it('shows unavailable message when Firebase is not initialized', () => {
      vi.mocked(isFirebaseInitialized).mockReturnValue(false);
      render(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByText('Feedback system is currently unavailable.')).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('closes modal when close button is clicked', () => {
      render(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
      const closeButton = screen.getByTitle('Close');
      fireEvent.click(closeButton);
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('closes modal when cancel button is clicked', () => {
      render(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('closes modal when overlay is clicked', () => {
      render(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
      const overlay = document.querySelector('.feedback-modal-overlay');
      if (overlay) {
        fireEvent.click(overlay);
        expect(mockOnClose).toHaveBeenCalled();
      }
    });

    it('does not close when modal content is clicked', () => {
      render(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
      const modal = document.querySelector('.feedback-modal');
      if (modal) {
        fireEvent.click(modal);
        expect(mockOnClose).not.toHaveBeenCalled();
      }
    });

    it('selects feedback type when clicked', () => {
      render(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
      const bugButton = screen.getByText('Bug Report').closest('button');
      if (bugButton) {
        fireEvent.click(bugButton);
        expect(bugButton).toHaveClass('selected');
      }
    });

    it('updates message when typing', () => {
      render(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
      const textarea = screen.getByRole('textbox', { name: /your message/i });
      fireEvent.change(textarea, { target: { value: 'Test message' } });
      expect(textarea).toHaveValue('Test message');
    });

    it('updates email when typing', () => {
      render(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
      const emailInput = screen.getByPlaceholderText('your@email.com');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      expect(emailInput).toHaveValue('test@example.com');
    });
  });

  describe('form validation', () => {
    it('disables submit button when no type is selected', () => {
      render(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
      const textarea = screen.getByRole('textbox', { name: /your message/i });
      fireEvent.change(textarea, { target: { value: 'Test message' } });
      const submitButton = screen.getByRole('button', { name: /submit feedback/i });
      expect(submitButton).toBeDisabled();
    });

    it('disables submit button when message is empty', () => {
      render(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
      const bugButton = screen.getByText('Bug Report').closest('button');
      if (bugButton) {
        fireEvent.click(bugButton);
      }
      const submitButton = screen.getByRole('button', { name: /submit feedback/i });
      expect(submitButton).toBeDisabled();
    });

    it('enables submit button when type and message are provided', () => {
      render(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
      const bugButton = screen.getByText('Bug Report').closest('button');
      if (bugButton) {
        fireEvent.click(bugButton);
      }
      const textarea = screen.getByRole('textbox', { name: /your message/i });
      fireEvent.change(textarea, { target: { value: 'Test message' } });
      const submitButton = screen.getByRole('button', { name: /submit feedback/i });
      expect(submitButton).not.toBeDisabled();
    });
  });

  describe('form submission', () => {
    it('submits feedback successfully', async () => {
      vi.mocked(submitFeedback).mockResolvedValue({ success: true });

      render(<FeedbackModal isOpen={true} onClose={mockOnClose} />);

      // Select type
      const bugButton = screen.getByText('Bug Report').closest('button');
      if (bugButton) {
        fireEvent.click(bugButton);
      }

      // Enter message
      const textarea = screen.getByRole('textbox', { name: /your message/i });
      fireEvent.change(textarea, { target: { value: 'Test bug report' } });

      // Submit
      const submitButton = screen.getByRole('button', { name: /submit feedback/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(submitFeedback).toHaveBeenCalledWith('bug', 'Test bug report', undefined);
      });

      await waitFor(() => {
        expect(screen.getByText('Thank you!')).toBeInTheDocument();
      });
    });

    it('submits feedback with email', async () => {
      vi.mocked(submitFeedback).mockResolvedValue({ success: true });

      render(<FeedbackModal isOpen={true} onClose={mockOnClose} />);

      // Select type
      const featureButton = screen.getByText('Feature Request').closest('button');
      if (featureButton) {
        fireEvent.click(featureButton);
      }

      // Enter message
      const textarea = screen.getByRole('textbox', { name: /your message/i });
      fireEvent.change(textarea, { target: { value: 'Feature request' } });

      // Enter email
      const emailInput = screen.getByPlaceholderText('your@email.com');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

      // Submit
      const submitButton = screen.getByRole('button', { name: /submit feedback/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(submitFeedback).toHaveBeenCalledWith(
          'feature',
          'Feature request',
          'test@example.com'
        );
      });
    });

    it('shows error message on submission failure', async () => {
      vi.mocked(submitFeedback).mockResolvedValue({
        success: false,
        error: 'Network error',
      });

      render(<FeedbackModal isOpen={true} onClose={mockOnClose} />);

      // Select type
      const otherButton = screen.getByText('Other').closest('button');
      if (otherButton) {
        fireEvent.click(otherButton);
      }

      // Enter message
      const textarea = screen.getByRole('textbox', { name: /your message/i });
      fireEvent.change(textarea, { target: { value: 'Test message' } });

      // Submit
      const submitButton = screen.getByRole('button', { name: /submit feedback/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('shows loading state while submitting', async () => {
      vi.mocked(submitFeedback).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100))
      );

      render(<FeedbackModal isOpen={true} onClose={mockOnClose} />);

      // Select type
      const dataButton = screen.getByText('Data Issue').closest('button');
      if (dataButton) {
        fireEvent.click(dataButton);
      }

      // Enter message
      const textarea = screen.getByRole('textbox', { name: /your message/i });
      fireEvent.change(textarea, { target: { value: 'Missing data' } });

      // Submit
      const submitButton = screen.getByRole('button', { name: /submit feedback/i });
      fireEvent.click(submitButton);

      expect(screen.getByText('Submitting...')).toBeInTheDocument();
    });
  });

  describe('placeholder text changes by type', () => {
    it('shows bug-specific placeholder when bug type is selected', () => {
      render(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
      const bugButton = screen.getByText('Bug Report').closest('button');
      if (bugButton) {
        fireEvent.click(bugButton);
      }
      const textarea = screen.getByRole('textbox', { name: /your message/i });
      expect(textarea).toHaveAttribute('placeholder', expect.stringContaining('bug'));
    });

    it('shows feature-specific placeholder when feature type is selected', () => {
      render(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
      const featureButton = screen.getByText('Feature Request').closest('button');
      if (featureButton) {
        fireEvent.click(featureButton);
      }
      const textarea = screen.getByRole('textbox', { name: /your message/i });
      expect(textarea).toHaveAttribute('placeholder', expect.stringContaining('feature'));
    });

    it('shows data-specific placeholder when data issue type is selected', () => {
      render(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
      const dataButton = screen.getByText('Data Issue').closest('button');
      if (dataButton) {
        fireEvent.click(dataButton);
      }
      const textarea = screen.getByRole('textbox', { name: /your message/i });
      expect(textarea).toHaveAttribute('placeholder', expect.stringContaining('constituency'));
    });
  });
});
