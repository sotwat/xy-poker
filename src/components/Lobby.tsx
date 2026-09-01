import React, { useState } from 'react';
import { playClickSound } from '../utils/sound';
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
                <div className="lobby-top-bar">
                    <div className="player-rank-badge">
                        <span className="rank-label">RANK</span>
                        <span className="rank-value">??</span>
                    </div>
                    <div className="player-meta-info-online">
                        <span className="player-display-name">Connecting...</span>
                    </div>
                </div>
                <div className="waiting-room glass-panel">
                    <div className="loading-spinner"></div>
                    <p>Connecting to game server...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="lobby-container online-lobby">
            <div className="lobby-top-bar-online">
                <button type="button" className="back-btn" onClick={() => { playClickSound(); if (onBack) onBack(); }}>
                    <span aria-hidden="true">←</span> Back
                </button>
                <div className="player-meta-info-online">
                    <span className="player-display-name">{playerName || 'Guest'}</span>
                    <span className="player-rating-badge">Rating {rating ?? 1500}</span>
                </div>
            </div>

            <div className="online-lobby-content glass-panel">
                <div className="online-lobby-heading">
                    <span className="home-kicker">MULTIPLAYER</span>
                    <h3 className="section-title">Online match</h3>
                    <p>Play ranked or invite someone with a four-character room code.</p>
                </div>

                <div className="lobby-field-row">
                    <label htmlFor="playerName">Display name</label>
                    <input
                        id="playerName"
                        type="text"
                        value={playerName}
                        onChange={(e) => onPlayerNameChange(e.target.value)}
                        maxLength={10}
                        placeholder="Player Name"
                    />
                </div>

                <div className="action-card-primary">
                    <button 
                        type="button"
                        className="quest-btn-primary" 
                        onClick={() => { playClickSound(); onQuickMatch(); }}
                    >
                        <span className="quest-tag">RANKED</span>
                        <span className="quest-title">Find a match</span>
                        <span className="quest-arrow" aria-hidden="true">→</span>
                    </button>
                    <p className="hint-text">Matches use your current rating.</p>
                </div>

                <div className="divider-text">
                    <span>PRIVATE ROOM</span>
                </div>

                {!roomId ? (
                    <div className="room-actions-grid">
                        <div className="action-card-secondary">
                            <h4>Create Room</h4>
                            <p className="card-desc">Get a code to share with a friend.</p>
                            <button 
                                type="button"
                                className="quest-btn-secondary" 
                                onClick={() => { playClickSound(); onCreateRoom(); }}
                            >
                                Create Room
                            </button>
                        </div>

                        <div className="action-card-secondary">
                            <h4>Join Room</h4>
                            <p className="card-desc">Enter a four-character code.</p>
                            <input
                                type="text"
                                placeholder="Room ID"
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
                                Join Room
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="waiting-room-overlay">
                        <span className="status-pill">Room ready</span>
                        <h3>{playerRole === 'host' ? 'Invite a player' : 'Connected'}</h3>
                        <div className="room-id-box">
                            <span className="room-id-label">Room code</span>
                            <span className="id-num">{roomId}</span>
                            {playerRole === 'host' && (
                                <button
                                    type="button"
                                    className="copy-id-btn"
                                    onClick={copyRoomId}
                                >
                                    {copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Try again' : 'Copy'}
                                </button>
                            )}
                        </div>
                        <p className="room-status-text" aria-live="polite">
                            {playerRole === 'host' ? 'Share this ID with a friend' : 'Connected! Waiting for host...'}
                        </p>
                        <div className="loading-spinner"></div>
                        <button type="button" className="quest-btn-cancel" onClick={() => { playClickSound(); onCancelMatchmaking(); }}>
                            Cancel
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
