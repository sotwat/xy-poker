import React, { useState } from 'react';
import { ArrowLeft, Copy, UserRound } from 'lucide-react';
import { playClickSound } from '../utils/sound';
import { useI18n } from '../i18n';
import './Lobby.css';

interface LobbyProps {
    onCreateRoom: () => void;
    onJoinRoom: (roomId: string) => void;
    onQuickMatch: () => void;
    onCancelMatchmaking: () => void;
    roomId: string | null;
    isConnected: boolean;
    playerRole: 'host' | 'guest' | null;
    playerName: string;
    onPlayerNameChange: (name: string) => void;
    rating?: number | null;
    onBack?: () => void;
}

export const Lobby: React.FC<LobbyProps> = ({
    onCreateRoom,
    onJoinRoom,
    onQuickMatch,
    onCancelMatchmaking,
    roomId,
    isConnected,
    playerRole,
    playerName,
    onPlayerNameChange,
    rating,
    onBack
}) => {
    const { t } = useI18n();
    const [joinId, setJoinId] = useState('');
    const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

    const copyRoomId = async () => {
        if (!roomId) return;
        try {
            await navigator.clipboard.writeText(roomId);
            setCopyStatus('copied');
        } catch {
            setCopyStatus('failed');
        }
    };

    if (!isConnected) {
        return (
            <div className="lobby-container online-lobby">
                <div className="lobby-top-bar-online">
                    <button type="button" className="back-btn" onClick={() => { playClickSound(); if (onBack) onBack(); }}>
                        <ArrowLeft aria-hidden="true" />
                        <span>{t('common.back')}</span>
                    </button>
                    <div className="player-meta-info-online">
                        <span className="player-display-name">{playerName || t('common.guest')}</span>
                        <span className="player-rating-badge">{t('common.rating')} {rating ?? 1500}</span>
                    </div>
                </div>
                <div className="waiting-room connection-room">
                    <div className="loading-spinner"></div>
                    <div>
                        <h3>{t('lobby.connecting')}</h3>
                        <p>{t('lobby.connectingServer')}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="lobby-container online-lobby">
            <div className="lobby-top-bar-online">
                <button type="button" className="back-btn" onClick={() => { playClickSound(); if (onBack) onBack(); }}>
                    <ArrowLeft aria-hidden="true" />
                    <span>{t('common.back')}</span>
                </button>
                <div className="player-meta-info-online">
                    <span className="player-display-name">{playerName || t('common.guest')}</span>
                    <span className="player-rating-badge">{t('common.rating')} {rating ?? 1500}</span>
                </div>
            </div>

            <div className="online-lobby-content glass-panel">
                <div className="lobby-field-row">
                    <label htmlFor="playerName"><UserRound aria-hidden="true" />{t('lobby.displayName')}</label>
                    <input
                        id="playerName"
                        type="text"
                        value={playerName}
                        onChange={(e) => onPlayerNameChange(e.target.value)}
                        maxLength={10}
                        placeholder={t('lobby.playerName')}
                    />
                </div>

                <div className="action-card-primary">
                    <button 
                        type="button"
                        className="quest-btn-primary" 
                        onClick={() => { playClickSound(); onQuickMatch(); }}
                    >
                        <span>
                            <span className="rank-match-title">{t('lobby.ranked')}</span>
                            <span className="quest-title">{t('lobby.find')}</span>
                        </span>
                    </button>
                </div>

                <div className="divider-text">
                    <span>{t('lobby.private')}</span>
                </div>

                {!roomId ? (
                    <div className="room-actions-grid">
                        <div className="action-card-secondary room-create">
                            <button 
                                type="button"
                                className="quest-btn-secondary" 
                                onClick={() => { playClickSound(); onCreateRoom(); }}
                            >
                                {t('lobby.create')}
                            </button>
                        </div>

                        <div className="action-card-secondary room-join">
                            <label htmlFor="join-room-code">{t('lobby.roomCode')}</label>
                            <input
                                id="join-room-code"
                                type="text"
                                placeholder={t('lobby.roomId')}
                                aria-label={t('lobby.roomId')}
                                value={joinId}
                                onChange={(e) => setJoinId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                                maxLength={4}
                                className="room-id-input"
                                autoComplete="off"
                                inputMode="text"
                            />
                            <button
                                type="button"
                                className="quest-btn-secondary"
                                onClick={() => { playClickSound(); onJoinRoom(joinId); }}
                                disabled={joinId.length !== 4}
                            >
                                {t('lobby.join')}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="waiting-room-overlay">
                        <span className="status-pill">{t('lobby.ready')}</span>
                        <h3>{playerRole === 'host' ? t('lobby.invite') : t('lobby.connected')}</h3>
                        <div className="room-id-box">
                            <span className="room-id-label">{t('lobby.roomCode')}</span>
                            <span className="id-num">{roomId}</span>
                            {playerRole === 'host' && (
                                <button
                                    type="button"
                                    className="copy-id-btn"
                                    onClick={copyRoomId}
                                >
                                    <Copy aria-hidden="true" />
                                    {copyStatus === 'copied' ? t('lobby.copied') : copyStatus === 'failed' ? t('common.retry') : t('lobby.copy')}
                                </button>
                            )}
                        </div>
                        <p className="room-status-text" aria-live="polite">
                            {playerRole === 'host' ? t('lobby.share') : t('lobby.waitHost')}
                        </p>
                        <div className="loading-spinner"></div>
                        <button type="button" className="quest-btn-cancel" onClick={() => { playClickSound(); onCancelMatchmaking(); }}>
                            {t('common.cancel')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
