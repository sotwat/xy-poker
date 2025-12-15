import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import './MyPage.css';

interface MyPageProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
    isPremium: boolean;
}

interface Profile {
    id: string;
    rating: number;
    xp: number;
    level: number;
    games_played: number;
    wins: number;
    username?: string; // Optional if not set
}

interface Achievement {
    id: string;
    achievement_type: string;
    unlocked_at: string;
}

interface LeaderboardEntry {
    rating: number;
    username: string; // fallback to 'Player' or part of ID
    id: string;
}

export const MyPage: React.FC<MyPageProps> = ({ isOpen, onClose, userId, isPremium }) => {
    const [activeTab, setActiveTab] = useState<'stats' | 'ranking' | 'achievements'>('stats');
    const [profile, setProfile] = useState<Profile | null>(null);
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [loading, setLoading] = useState(false);

    // Name Editing State
    const [isEditingName, setIsEditingName] = useState(false);
    const [editNameValue, setEditNameValue] = useState('');

    useEffect(() => {
        if (isOpen && userId) {
            fetchData();
        }
    }, [isOpen, userId, activeTab]);

    useEffect(() => {
        if (profile?.username) {
            setEditNameValue(profile.username);
        }
    }, [profile]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Profile
            // Always re-fetch profile on open to get latest stats
            const { data: pData } = await supabase
                .from('players')
                .select('*')
                .eq('id', userId)
                .single();
            if (pData) {
                setProfile(pData);
                if (pData.username) setEditNameValue(pData.username);
            }

            // 2. Fetch Ranking
            if (activeTab === 'ranking') {
                const { data: lData } = await supabase
                    .from('players')
                    .select('id, rating, username')
                    .order('rating', { ascending: false })
                    .limit(50);

                // Map to displayable format
                const mapped = (lData || []).map((entry: any) => ({
                    rating: entry.rating,
                    username: entry.username || `User ${entry.id.slice(0, 4)}`,
                    id: entry.id
                }));
                setLeaderboard(mapped);
            }

            // 3. Fetch Achievements
            if (activeTab === 'achievements' && profile) {
                // Assuming we query the new 'achievements' table linked to player_id (which is pData.id)
                // But wait, key is player_id, which is the internal ID, not necessarily user_id. 
                // We need the player ID from the profile first.
                // if (profile) { // This check is now part of the outer if condition
                const { data: aData } = await supabase
                    .from('achievements')
                    .select('*')
                    .eq('player_id', profile.id);
                setAchievements(aData || []);
                // }
            }

        } catch (err) {
            console.error('Error fetching MyPage data:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateName = async () => {
        if (!profile || !editNameValue.trim()) return;
        if (editNameValue.length > 15) {
            alert("Name must be 15 characters or less.");
            return;
        }

        try {
            const { error } = await supabase
                .from('players')
                .update({ username: editNameValue.trim() })
                .eq('id', profile.id);

            if (error) throw error;

            setProfile({ ...profile, username: editNameValue.trim() });
            setIsEditingName(false);
        } catch (err) {
            console.error("Error updating name:", err);
            alert("Failed to update name.");
        }
    };

    if (!isOpen) return null;

    const nextLevelXp = (profile?.level || 1) * 100 + ((profile?.level || 1) ** 2) * 50; // Example curve
    const progress = profile ? Math.min(100, (profile.xp / nextLevelXp) * 100) : 0;

    // Win Rate Calculation
    const totalGames = profile?.games_played || 0;
    const totalWins = profile?.wins || 0;
    const winRate = totalGames > 0 ? ((totalWins / totalGames) * 100).toFixed(1) : '0.0';

    return (
        <div className="mypage-overlay" onClick={onClose}>
            <div className="mypage-content" onClick={e => e.stopPropagation()}>
                <button className="close-btn" onClick={onClose}>&times;</button>

                <div className="mypage-header">
                    <div className="header-left">
                        <h2>My Page</h2>
                        {profile && (
                            <div className="user-identity">
                                {isEditingName ? (
                                    <div className="name-edit-row">
                                        <input
                                            className="name-input"
                                            value={editNameValue}
                                            onChange={(e) => setEditNameValue(e.target.value)}
                                            placeholder="Enter Name"
                                        />
                                        <button onClick={handleUpdateName} className="save-btn">Save</button>
                                        <button onClick={() => setIsEditingName(false)} className="cancel-btn">Cancel</button>
                                    </div>
                                ) : (
                                    <div className="name-display-row">
                                        <span className="username">
                                            {isPremium && <span className="premium-badge" title="Premium User">💎</span>}
                                            {profile.username || 'No Name'}
                                        </span>
                                        <button onClick={() => setIsEditingName(true)} className="edit-icon-btn">✎</button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="level-badge">
                        <span className="level-label">LV</span>
                        <span className="level-val">{profile?.level || 1}</span>
                    </div>
                </div>

                <div className="mypage-tabs">
                    <button className={activeTab === 'stats' ? 'active' : ''} onClick={() => setActiveTab('stats')}>Stats & Progress</button>
                    <button className={activeTab === 'ranking' ? 'active' : ''} onClick={() => setActiveTab('ranking')}>World Ranking</button>
                    <button className={activeTab === 'achievements' ? 'active' : ''} onClick={() => setActiveTab('achievements')}>Achievements</button>
                </div>

                <div className="mypage-body">
                    {loading && <div className="loading">Loading...</div>}

                    {!loading && activeTab === 'stats' && profile && (
                        <div className="stats-view">
                            <div className="stat-card">
                                <label>Rating</label>
                                <div className="value">{profile.rating}</div>
                            </div>
                            <div className="stat-card">
                                <label>Games</label>
                                <div className="value">{totalGames}</div>
                            </div>
                            <div className="stat-card">
                                <label>Win Rate</label>
                                <div className="value highlight">{winRate}%</div>
                            </div>
                            <div className="xp-section">
                                <div className="xp-labels">
                                    <span>XP Progress</span>
                                    <span>{profile.xp} / {nextLevelXp}</span>
                                </div>
                                <div className="xp-bar-bg">
                                    <div className="xp-bar-fill" style={{ width: `${progress}%` }}></div>
                                </div>
                            </div>
                        </div>
                    )}

                    {!loading && activeTab === 'ranking' && (
                        <div className="ranking-view">
                            <table>
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Player</th>
                                        <th>Rating</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {leaderboard.map((entry, idx) => (
                                        <tr key={entry.id} className={entry.id === userId ? 'highlight' : ''}>
                                            <td>{idx + 1}</td>
                                            <td>{entry.username}</td>
                                            <td>{entry.rating}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {!loading && activeTab === 'achievements' && (
                        <div className="achievements-view">
                            {achievements.length === 0 ? (
                                <div className="empty-state">No achievements yet. Keep playing!</div>
                            ) : (
                                achievements.map(a => (
                                    <div className="achievement-item" key={a.id}>
                                        <div className="icon">🏆</div>
                                        <div className="info">
                                            <div className="title">{getReadableAchievement(a.achievement_type)}</div>
                                            <div className="date">{new Date(a.unlocked_at).toLocaleDateString()}</div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// Helper
const getReadableAchievement = (type: string) => {
    switch (type) {
        case 'first_win': return 'First Victory';
        case 'win_streak_3': return 'Winning Streak (3)';
        case 'straight_flush_x': return 'Master of X (Straight Flush)';
        case 'perfect_game': return 'Perfect Game';
        default: return type.replace(/_/g, ' ');
    }
};
