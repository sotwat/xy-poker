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
    onShowRules: () => void;
    onShowMyPage: () => void;
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
    onShowRules,
    onShowMyPage
}) => {
    const [joinId, setJoinId] = useState('');

    if (!isConnected) {
        return (
            <div className="lobby-container">
                <h2>Online Multiplayer</h2>
                <div className="waiting-room">
                    <div className="loading-spinner">Connecting to server...</div>
                    <p style={{ marginTop: '1rem', color: '#888' }}>
                        Ensure the server is running on port 3001.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="lobby-container">
            <h2>Online Multiplayer</h2>

            {/* Player Name Input */}
            <div className="name-input-section">
                <label htmlFor="playerName">Your Name:</label>
                <input
                    id="playerName"
                    type="text"
                    value={playerName}
                    onChange={(e) => onPlayerNameChange(e.target.value)}
                    maxLength={10}
                    placeholder="Enter your name"
                />
                {rating !== null && rating !== undefined && (
                    <div className="player-rating-display" style={{
                        marginTop: '8px',
                        fontSize: '0.9rem',
                        color: '#ffffff',
                        fontWeight: 'bold',
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: '4px 12px',
                        borderRadius: '12px',
                        display: 'inline-block',
                        textShadow: 'none'
                    }}>
                        Your Rating: <span style={{ fontSize: '1.1rem' }}>{rating}</span>
                    </div>
                )}
            </div>

            <div className="quick-match-section">
                <button className="btn-primary btn-large" onClick={() => { playClickSound(); onQuickMatch(); }}>
                    🎲 Quick Match
                </button>
                <p className="quick-match-hint">Play against a random opponent</p>
            </div>

            <div className="lobby-helper-actions" style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '1rem' }}>
                <button className="btn-secondary" onClick={() => { playClickSound(); onShowMyPage(); }}>
                    👤 My Page
                </button>
                <button className="btn-secondary" onClick={() => { playClickSound(); onShowRules(); }}>
                    📖 Rules
                </button>
            </div>

            <div className="divider">
                <span>OR</span>
            </div>

            {
                !roomId ? (
                    <div className="lobby-actions">
                        <div className="action-box">
                            <h3>Create Room</h3>
                            <p>Start a new game and invite a friend.</p>
                            <button className="btn-primary" onClick={() => { playClickSound(); onCreateRoom(); }}>Create Room</button>
                        </div>

                        <div className="divider">OR</div>

                        <div className="action-box">
                            <h3>Join Room</h3>
                            <p>Enter the Room ID to join.</p>
                            <input
                                type="text"
                                placeholder="Room ID"
                                value={joinId}
                                onChange={(e) => setJoinId(e.target.value)}
                                maxLength={4}
                            />
                            <button
                                className="btn-secondary"
                                onClick={() => { playClickSound(); onJoinRoom(joinId); }}
                                disabled={joinId.length !== 4}
                            >
                                Join Room
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="waiting-room">
                        <h3>{playerRole === 'host' ? 'Room Created!' : 'Joined Room!'}</h3>
                        <div className="room-id-display">
                            Room ID: <span>{roomId}</span>
                            {playerRole === 'host' && (
                                <button
                                    className="btn-icon copy-btn"
                                    onClick={() => {
                                        navigator.clipboard.writeText(roomId);
                                        alert('Room ID copied!');
                                    }}
                                    title="Copy to Clipboard"
                                >
                                    📋
                                </button>
                            )}
                        </div>
                        <p>{playerRole === 'host' ? 'Share this ID with your friend.' : 'Waiting for game to start...'}</p>
                        {playerRole === 'host' && <div className="loading-spinner">Waiting for opponent... Game starts automatically.</div>}
                        {playerRole === 'guest' && <div className="loading-spinner">Connected to Room</div>}
                        <button className="btn-cancel" onClick={() => { playClickSound(); onCancelMatchmaking(); }}>
                            Cancel
                        </button>
                    </div>
                )
            }
        </div >
    );
};
