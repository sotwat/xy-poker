import React, { useState } from 'react';
import { supabase } from '../supabase';
import { useI18n } from '../i18n';
import './AuthModal.css';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const { language, t } = useI18n();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            if (isSignUp) {
                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: 'https://xy-poker.pages.dev',
                    },
                });
                if (error) throw error;

                // If user is created but no session, email confirmation is likely required
                if (data.user && !data.session) {
                    alert(t('auth.confirmEmail'));
                    onClose();
                    return;
                }

                alert(t('auth.created'));
                onSuccess();
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                onSuccess();
            }
            onClose();
        } catch (err: unknown) {
            setError(language === 'ja' ? t('auth.error') : (err instanceof Error ? err.message : t('auth.error')));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-overlay">
            <div className="auth-content">
                <button type="button" className="close-btn" onClick={onClose} aria-label={t('common.close')}>&times;</button>
                <h2>{isSignUp ? t('auth.create') : t('auth.signIn')}</h2>
                <p className="auth-description">
                    {isSignUp
                        ? t('auth.createDescription')
                        : t('auth.signInDescription')}
                </p>

                {error && <div className="auth-error">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <input
                        type="email"
                        placeholder={t('auth.email')}
                        aria-label={t('auth.email')}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                    <input
                        type="password"
                        placeholder={t('auth.password')}
                        aria-label={t('auth.password')}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                    />
                    <button type="submit" className="auth-submit-btn" disabled={loading}>
                        {loading ? t('auth.processing') : (isSignUp ? t('auth.signUp') : t('auth.signIn'))}
                    </button>
                </form>

                <div className="auth-toggle">
                    <button type="button" onClick={() => setIsSignUp(!isSignUp)}>
                        {isSignUp ? t('auth.hasAccount') : t('auth.noAccount')}
                    </button>
                </div>
            </div>
        </div>
    );
};
