import React, { useState } from 'react';
import { socket } from '../logic/online';
import './ContactForm.css';

interface ContactFormProps {
    onClose: () => void;
    playerId?: string;
    initialCategory?: 'request' | 'bug' | 'other';
}

const ContactForm: React.FC<ContactFormProps> = ({ onClose, playerId, initialCategory = 'request' }) => {
    const [category, setCategory] = useState<'request' | 'bug' | 'other'>(initialCategory);
    const [contactInfo, setContactInfo] = useState('');
    const [deviceInfo, setDeviceInfo] = useState(''); // No auto-fill
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!message.trim()) return;

        setIsSubmitting(true);
        setSubmitStatus('idle');

        try {
            const result = await new Promise<{ success: boolean; error?: string }>((resolve, reject) => {
                socket.timeout(5_000).emit('submit_contact', {
                    category,
                    contactInfo: contactInfo || (playerId ? `Player:${playerId}` : ''),
                    deviceInfo,
                    message: message.trim(),
                }, (error: Error | null, response?: { success: boolean; error?: string }) => {
                    if (error) reject(error);
                    else resolve(response ?? { success: false, error: 'No response' });
                });
            });
            if (!result.success) throw new Error(result.error || 'Submission rejected');

            setSubmitStatus('success');
            setTimeout(() => {
                onClose();
            }, 2000); // Auto close after 2s
        } catch (err: unknown) {
            console.error('Contact submit error:', err);
            setSubmitStatus('error');
            setErrorMessage(err instanceof Error ? err.message : 'Failed to submit. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (submitStatus === 'success') {
        return (
            <div className="modal-overlay">
                <div className="contact-modal success">
                    <div className="success-icon">Sent</div>
                    <h3>Message Sent!</h3>
                    <p>Thank you for your feedback.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="modal-overlay">
            <div className="contact-modal">
                <div className="modal-header">
                    <h2>Contact / Report</h2>
                    <button type="button" className="close-btn" onClick={onClose} aria-label="Close">×</button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Category</label>
                        <div className="category-options">
                            <button
                                type="button"
                                className={`cat-btn ${category === 'request' ? 'active' : ''}`}
                                onClick={() => setCategory('request')}
                            >
                                Request
                            </button>
                            <button
                                type="button"
                                className={`cat-btn ${category === 'bug' ? 'active' : ''}`}
                                onClick={() => setCategory('bug')}
                            >
                                Bug
                            </button>
                            <button
                                type="button"
                                className={`cat-btn ${category === 'other' ? 'active' : ''}`}
                                onClick={() => setCategory('other')}
                            >
                                Other
                            </button>
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Contact (Optional)</label>
                        <input
                            type="text"
                            placeholder="Email or User ID"
                            value={contactInfo}
                            onChange={e => setContactInfo(e.target.value)}
                        />
                    </div>

                    <div className="form-group">
                        <label>Device / OS</label>
                        <input
                            type="text"
                            value={deviceInfo}
                            onChange={e => setDeviceInfo(e.target.value)}
                            placeholder="e.g. iPhone, Chrome on Windows"
                            style={{ fontSize: '0.8rem', color: '#aaa' }}
                        />
                    </div>

                    <div className="form-group">
                        <label>Message <span className="required">*</span></label>
                        <textarea
                            placeholder="Describe your request or issue..."
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            required
                            rows={5}
                        />
                    </div>

                    {submitStatus === 'error' && (
                        <div className="error-message">
                            {errorMessage}
                        </div>
                    )}

                    <div className="modal-actions">
                        <button type="button" className="btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={isSubmitting || !message.trim()}
                        >
                            {isSubmitting ? 'Sending...' : 'Send Message'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ContactForm;
