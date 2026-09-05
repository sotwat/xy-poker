import { Modal } from './Modal';
import React, { useState } from 'react';
import { socket } from '../logic/online';
import { useI18n } from '../i18n';
import './ContactForm.css';

interface ContactFormProps {
    onClose: () => void;
    playerId?: string;
    initialCategory?: 'request' | 'bug' | 'other';
}

const ContactForm: React.FC<ContactFormProps> = ({ onClose, playerId, initialCategory = 'request' }) => {
    const { language, t } = useI18n();
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
                    else resolve(response ?? { success: false, error: t('contact.failed') });
                });
            });
            if (!result.success) throw new Error(result.error || t('contact.failed'));

            setSubmitStatus('success');
            setTimeout(() => {
                onClose();
            }, 2000); // Auto close after 2s
        } catch (err: unknown) {
            console.error('Contact submit error:', err);
            setSubmitStatus('error');
            setErrorMessage(language === 'ja' ? t('contact.failed') : (err instanceof Error ? err.message : t('contact.failed')));
        } finally {
            setIsSubmitting(false);
        }
    };

    if (submitStatus === 'success') {
        return (
            <Modal className="modal-overlay" label={t('home.feedback')} onClose={onClose}>
                <div className="contact-modal success">
                    <div className="success-icon">{t('contact.sent')}</div>
                    <h3>{t('contact.sentTitle')}</h3>
                    <p>{t('contact.thanks')}</p>
                </div>
            </Modal>
        );
    }

    return (
        <Modal className="modal-overlay" label={t('home.feedback')} onClose={onClose}>
            <div className="contact-modal">
                <div className="modal-header">
                    <h2>{t('contact.title')}</h2>
                    <button type="button" className="close-btn" onClick={onClose} aria-label={t('common.close')}>×</button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>{t('contact.category')}</label>
                        <div className="category-options">
                            <button
                                type="button"
                                className={`cat-btn ${category === 'request' ? 'active' : ''}`}
                                onClick={() => setCategory('request')}
                            >
                                {t('contact.request')}
                            </button>
                            <button
                                type="button"
                                className={`cat-btn ${category === 'bug' ? 'active' : ''}`}
                                onClick={() => setCategory('bug')}
                            >
                                {t('contact.bug')}
                            </button>
                            <button
                                type="button"
                                className={`cat-btn ${category === 'other' ? 'active' : ''}`}
                                onClick={() => setCategory('other')}
                            >
                                {t('contact.other')}
                            </button>
                        </div>
                    </div>

                    <div className="form-group">
                        <label htmlFor="contact-address">{t('contact.optional')}</label>
                        <input
                            type="text"
                            id="contact-address"
                            placeholder={t('contact.contactPlaceholder')}
                            value={contactInfo}
                            onChange={e => setContactInfo(e.target.value)}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="contact-device">{t('contact.device')}</label>
                        <input
                            type="text"
                            id="contact-device"
                            value={deviceInfo}
                            onChange={e => setDeviceInfo(e.target.value)}
                            placeholder={t('contact.devicePlaceholder')}
                            style={{ fontSize: '0.8rem', color: '#aaa' }}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="contact-message">{t('contact.message')} <span className="required">*</span></label>
                        <textarea
                            id="contact-message"
                            placeholder={t('contact.messagePlaceholder')}
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
                            {t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={isSubmitting || !message.trim()}
                        >
                            {isSubmitting ? t('contact.sending') : t('contact.send')}
                        </button>
                    </div>
                </form>
            </div>
        </Modal>
    );
};

export default ContactForm;
