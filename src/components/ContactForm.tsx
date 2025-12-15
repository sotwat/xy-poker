import React, { useState } from 'react';
import { supabase } from '../supabase';
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
            const { error } = await supabase
                .from('contact_messages')
                .insert([
                    {
                        category,
                        user_contact: contactInfo || `Player:${playerId || 'Unknown'}`,
                        message: `[Device: ${deviceInfo}]\n\n${message.trim()}`,
                    }
                ]);

            if (error) throw error;

            setSubmitStatus('success');
            setTimeout(() => {
                onClose();
            }, 2000); // Auto close after 2s
        } catch (err: any) {
            console.error('Contact submit error:', err);
            setSubmitStatus('error');
            setErrorMessage(err.message || 'Failed to submit. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (submitStatus === 'success') {
        return (
            <div className="modal-overlay">
                <div className="contact-modal success">
                    <div className="success-icon">✅</div>
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
                    <h2>📬 Contact / Report</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
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
                                ✨ Request
                            </button>
                            <button
                                type="button"
                                className={`cat-btn ${category === 'bug' ? 'active' : ''}`}
                                onClick={() => setCategory('bug')}
                            >
                                🐛 Bug
                            </button>
                            <button
                                type="button"
                                className={`cat-btn ${category === 'other' ? 'active' : ''}`}
                                onClick={() => setCategory('other')}
                            >
                                📝 Other
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
