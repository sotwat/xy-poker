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
                    <p style={{ marginTop: '1.5rem', color: '#ff3366', fontWeight: 'bold' }}>
                        Connecting to game server...
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="lobby-container online-lobby">
            {/* Top Status Bar with back navigation */}
            <div className="lobby-top-bar-online">
                <button className="back-btn" onClick={() => { playClickSound(); if (onBack) onBack(); }}>
                    ← Back
                </button>
                <div className="player-meta-info-online">
                    <span className="player-display-name">{playerName || 'Guest'}</span>
                    <span className="player-rating-badge">🏆 {rating || 1500}</span>
                </div>
            </div>



            {/* Lobby UI Main content panel */}
            <div className="online-lobby-content glass-panel">
                <h3 className="section-title">Online Multiplayer</h3>

                {/* Edit player name row */}
                <div className="lobby-field-row">
                    <label htmlFor="playerName">Name: </label>
                    <input
                        id="playerName"
                        type="text"
                        value={playerName}
                        onChange={(e) => onPlayerNameChange(e.target.value)}
                        maxLength={10}
                        placeholder="Player Name"
                    />
                </div>

                {/* Ranked Match Action Button */}
                <div className="action-card-primary">
                    <button 
                        className="quest-btn-primary" 
                        onClick={() => { playClickSound(); onQuickMatch(); }}
                    >
                        <span className="quest-tag">RANKED BATTLE</span>
                        <span className="quest-title">Quick Ranked Match</span>
                    </button>
                    <p className="hint-text">Find an opponent instantly based on rating.</p>
                </div>

                <div className="divider-text">
                    <span>OR CREATE/JOIN PRIVATE ROOM</span>
                </div>

                {!roomId ? (
                    <div className="room-actions-grid">
                        <div className="action-card-secondary">
                            <h4>Host Room</h4>
                            <p className="card-desc">Create private room and invite a friend.</p>
                            <button 
                                className="quest-btn-secondary" 
                                onClick={() => { playClickSound(); onCreateRoom(); }}
                            >
                                Host Room
                            </button>
                        </div>

                        <div className="action-card-secondary">
                            <h4>Join Room</h4>
                            <p className="card-desc">Enter 4-character ID</p>
                            <input
                                type="text"
                                placeholder="Room ID"
                                value={joinId}
                                onChange={(e) => setJoinId(e.target.value)}
                                maxLength={4}
                                className="room-id-input"
                            />
                            <button
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
                        <h3>{playerRole === 'host' ? 'Host Room Created!' : 'Room Joined!'}</h3>
                        <div className="room-id-box">
                            Room ID: <span className="id-num">{roomId}</span>
                            {playerRole === 'host' && (
                                <button
                                    className="copy-id-btn"
                                    onClick={() => {
                                        navigator.clipboard.writeText(roomId);
                                        alert('Room ID copied!');
                                    }}
                                >
                                    📋 Copy
                                </button>
                            )}
                        </div>
                        <p className="room-status-text">
                            {playerRole === 'host' ? 'Share this ID with a friend' : 'Connected! Waiting for host...'}
                        </p>
                        <div className="loading-spinner"></div>
                        <button className="quest-btn-cancel" onClick={() => { playClickSound(); onCancelMatchmaking(); }}>
                            Cancel
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
