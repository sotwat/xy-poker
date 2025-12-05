import React, { useState } from 'react';
import './Lobby.css';

interface LobbyProps {
    onCreateRoom: () => void;
    onJoinRoom: (roomId: string) => void;
    roomId: string | null;
    isConnected: boolean;
    playerRole: 'host' | 'guest' | null;
    playerName: string;
    onPlayerNameChange: (name: string) => void;
}

export const Lobby: React.FC<LobbyProps> = ({
    onCreateRoom,
    onJoinRoom,
    roomId,
    isConnected,
    playerRole,
    playerName,
    onPlayerNameChange
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
                    maxLength={20}
                    placeholder="Enter your name"
                />
            </div>

            {!roomId ? (
                <div className="lobby-actions">
                    <div className="action-box">
                        <h3>Create Room</h3>
                        <p>Start a new game and invite a friend.</p>
                        <button className="btn-primary" onClick={onCreateRoom}>Create Room</button>
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
                            onClick={() => onJoinRoom(joinId)}
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
                    <p>{playerRole === 'host' ? 'Share this ID with your friend.' : 'Waiting for host to start game...'}</p>
                    {playerRole === 'host' && <div className="loading-spinner">Waiting for opponent to join...</div>}
                    {playerRole === 'guest' && <div className="loading-spinner">Connected to Room</div>}
                </div>
            )}
        </div>
    );
};
