import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { socket } from '../logic/online';
import type { BoardSkin, CardSkin, DiceSkin } from '../logic/types';
import {
    getGameRecordResult,
    isGameRecordData,
    loadLocalGameRecords,
    mergeGameRecords,
    type GameRecordData,
} from '../logic/gameRecord';
import { PremiumBadge } from './PremiumBadge';
import { GameRecordViewer } from './GameRecordViewer';
import './MyPage.css';
import { useI18n, type Translate } from '../i18n';
import { buildAchievementCatalog } from '../logic/achievements';

interface MyPageProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
    isPremium: boolean;
    onNameChange?: (newName: string) => void;
    selectedSkin: DiceSkin;
    selectedCardSkin: CardSkin;
    selectedBoardSkin: BoardSkin;
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

export const MyPage: React.FC<MyPageProps> = ({
    isOpen,
    onClose,
    userId,
    isPremium,
    onNameChange,
    selectedSkin,
    selectedCardSkin,
    selectedBoardSkin,
}) => {
    const { language, t, locale } = useI18n();
    const [activeTab, setActiveTab] = useState<'stats' | 'records' | 'ranking' | 'achievements'>('stats');
    const [profile, setProfile] = useState<Profile | null>(null);
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [gameRecords, setGameRecords] = useState<GameRecordData[]>([]);
    const [selectedRecord, setSelectedRecord] = useState<GameRecordData | null>(null);
    const [loading, setLoading] = useState(false);

    // Name Editing State
    const [isEditingName, setIsEditingName] = useState(false);
    const [editNameValue, setEditNameValue] = useState('');

    useEffect(() => {
        if (!isOpen || !userId) return;

        let cancelled = false;

        const fetchData = async () => {
            setLoading(true);
            try {
                const { data: rawProfile, error: profileError } = await supabase
                    .from('players')
                    .select('id, rating, xp, level, games_played, wins, username')
                    .eq('id', userId)
                    .single();

                if (profileError) throw profileError;
                const nextProfile = rawProfile as Profile;

                if (!cancelled) {
                    setProfile(nextProfile);
                    setEditNameValue(nextProfile.username ?? '');
                }

                if (activeTab === 'ranking') {
                    const { data, error } = await supabase
                        .from('players')
                        .select('id, rating, username')
                        .order('rating', { ascending: false })
                        .limit(50);

                    if (error) throw error;
                    const entries = (data ?? []) as LeaderboardEntry[];
                    if (!cancelled) {
                        setLeaderboard(entries.map(entry => ({
                            ...entry,
                            username: entry.username || `${language === 'ja' ? 'ユーザー' : 'User'} ${entry.id.slice(0, 4)}`,
                        })));
                    }
                }

                if (activeTab === 'achievements') {
                    const { data, error } = await supabase
                        .from('achievements')
                        .select('id, achievement_type, unlocked_at')
                        .eq('player_id', nextProfile.id);

                    if (error) throw error;
                    if (!cancelled) setAchievements((data ?? []) as Achievement[]);
                }

                if (activeTab === 'records') {
                    const localRecords = loadLocalGameRecords();
                    if (!cancelled) setGameRecords(localRecords);

                    const { data, error } = await supabase
                        .from('game_records')
                        .select('id, record_data')
                        .eq('player_id', nextProfile.id)
                        .order('played_at', { ascending: false })
                        .limit(50);

                    if (error) throw error;
                    const cloudRecords = (data ?? [])
                        .map(row => row.record_data as unknown)
                        .filter(isGameRecordData);
                    if (!cancelled) setGameRecords(mergeGameRecords(cloudRecords, localRecords));

                    if (socket.connected) {
                        const cloudIds = new Set(cloudRecords.map(record => record.id));
                        for (const localRecord of localRecords) {
                            if (!cloudIds.has(localRecord.id)) {
                                socket.emit('save_game_record', { record: localRecord });
                            }
                        }
                    }
                }
            } catch (err) {
                console.error('Error fetching MyPage data:', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void fetchData();
        return () => {
            cancelled = true;
        };
    }, [activeTab, isOpen, language, userId]);

    const handleUpdateName = async () => {
        if (!profile || !editNameValue.trim()) return;
        if (editNameValue.length > 15) {
            alert(t('mypage.nameTooLong'));
            return;
        }

        try {
            const response = await new Promise<{ success: boolean; username?: string; error?: string }>((resolve, reject) => {
                socket.timeout(3_000).emit('update_username', { username: editNameValue }, (error: Error | null, result?: { success: boolean; username?: string; error?: string }) => {
                    if (error) reject(error);
                    else resolve(result ?? { success: false, error: 'No response' });
                });
            });
            if (!response.success || !response.username) throw new Error(response.error || 'Update rejected');

            setProfile({ ...profile, username: response.username });
            setIsEditingName(false);
            onNameChange?.(response.username);
        } catch (err) {
            console.error("Error updating name:", err);
            alert(t('mypage.nameFailed'));
        }
    };

    if (!isOpen) return null;

    const nextLevelXp = (profile?.level || 1) * 100 + ((profile?.level || 1) ** 2) * 50; // Example curve
    const progress = profile ? Math.min(100, (profile.xp / nextLevelXp) * 100) : 0;

    // Win Rate Calculation
    const totalGames = profile?.games_played || 0;
    const totalWins = profile?.wins || 0;
    const winRate = totalGames > 0 ? ((totalWins / totalGames) * 100).toFixed(1) : '0.0';
    const achievementRows = buildAchievementCatalog(achievements);

    return (
        <div className="mypage-overlay">
            <div className={`mypage-content ${selectedRecord ? 'record-open' : ''}`}>
                <button type="button" className="close-btn" onClick={onClose} aria-label={t('common.close')}>&times;</button>

                {!selectedRecord && (
                    <>
                        <div className="mypage-header">
                            <div className="header-left">
                                <h2>{t('mypage.title')}</h2>
                                {profile && (
                                    <div className="user-identity">
                                        {isEditingName ? (
                                            <div className="name-edit-row">
                                                <input
                                                    className="name-input"
                                                    value={editNameValue}
                                                    onChange={(e) => setEditNameValue(e.target.value)}
                                                    placeholder={t('mypage.enterName')}
                                                />
                                                <button type="button" onClick={handleUpdateName} className="save-btn">{t('mypage.save')}</button>
                                                <button type="button" onClick={() => setIsEditingName(false)} className="cancel-btn">{t('common.cancel')}</button>
                                            </div>
                                        ) : (
                                            <div className="name-display-row">
                                                <span className="username">
                                                    {isPremium && <PremiumBadge />}
                                                    {profile.username || t('mypage.noName')}
                                                </span>
                                                <button type="button" onClick={() => setIsEditingName(true)} className="edit-icon-btn" aria-label={t('mypage.editName')}>{t('mypage.edit')}</button>
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
                            <button type="button" className={activeTab === 'stats' ? 'active' : ''} onClick={() => setActiveTab('stats')}>{t('mypage.stats')}</button>
                            <button type="button" className={activeTab === 'records' ? 'active' : ''} onClick={() => { setSelectedRecord(null); setActiveTab('records'); }}>{t('mypage.records')}</button>
                            <button type="button" className={activeTab === 'ranking' ? 'active' : ''} onClick={() => setActiveTab('ranking')}>{t('mypage.ranking')}</button>
                            <button type="button" className={activeTab === 'achievements' ? 'active' : ''} onClick={() => setActiveTab('achievements')}>{t('mypage.achievements')}</button>
                        </div>
                    </>
                )}

                <div className="mypage-body">
                    {loading && <div className="loading">{t('common.loading')}</div>}

                    {!loading && activeTab === 'stats' && profile && (
                        <div className="stats-view">
                            <div className="stat-card">
                                <label>{t('common.rating')}</label>
                                <div className="value">{profile.rating}</div>
                            </div>
                            <div className="stat-card">
                                <label>{t('mypage.games')}</label>
                                <div className="value">{totalGames}</div>
                            </div>
                            <div className="stat-card">
                                <label>{t('mypage.winRate')}</label>
                                <div className="value highlight">{winRate}%</div>
                            </div>
                            <div className="xp-section">
                                <div className="xp-labels">
                                    <span>{t('mypage.xp')}</span>
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
                                        <th>{t('mypage.player')}</th>
                                        <th>{t('common.rating')}</th>
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

                    {!loading && activeTab === 'records' && (
                        selectedRecord ? (
                            <GameRecordViewer
                                record={selectedRecord}
                                onBack={() => setSelectedRecord(null)}
                                selectedSkin={selectedSkin}
                                selectedCardSkin={selectedCardSkin}
                                selectedBoardSkin={selectedBoardSkin}
                            />
                        ) : (
                            <div className="records-view">
                                <div className="records-heading">
                                    <div>
                                        <span>{t('mypage.archive')}</span>
                                        <h3>{t('mypage.recordsTitle')}</h3>
                                    </div>
                                    <strong>{gameRecords.length}</strong>
                                </div>
                                {gameRecords.length === 0 ? (
                                    <div className="empty-state records-empty">
                                        <strong>{t('mypage.noRecords')}</strong>
                                        <span>{t('mypage.recordsHint')}</span>
                                    </div>
                                ) : (
                                    <div className="records-list">
                                        {gameRecords.map(record => {
                                            const result = getGameRecordResult(record);
                                            const opponentIndex = record.viewerPlayerIndex === 0 ? 1 : 0;
                                            const resultMark = result === 'win' ? t('record.win')[0] : result === 'loss' ? t('record.loss')[0] : t('record.draw')[0];
                                            return (
                                                <button
                                                    type="button"
                                                    className="record-list-item"
                                                    key={record.id}
                                                    onClick={() => setSelectedRecord(record)}
                                                >
                                                    <span className={`record-list-result record-list-result-${result}`}>{resultMark.toUpperCase()}</span>
                                                    <span className="record-list-main">
                                                        <strong>{t('common.vs')} {record.playerNames[opponentIndex]}</strong>
                                                        <span>{new Date(record.completedAt).toLocaleString(locale)}</span>
                                                    </span>
                                                    <span className="record-list-meta">
                                                        <strong>{record.scores[record.viewerPlayerIndex]} – {record.scores[opponentIndex]}</strong>
                                                        <span>{record.mode === 'bot' ? t('mypage.bot') : record.mode === 'ranked' ? t('lobby.ranked') : t('mypage.private')}</span>
                                                    </span>
                                                    <span className="record-list-arrow" aria-hidden="true">→</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )
                    )}

                    {!loading && activeTab === 'achievements' && (
                        <div className="achievements-view">
                            {achievementRows.map(({ type, achievement }) => (
                                <div
                                    className={`achievement-item ${achievement ? 'is-unlocked' : 'is-locked'}`}
                                    key={type}
                                >
                                    <div className="icon" aria-hidden="true">{achievement ? '✓' : '◇'}</div>
                                    <div className="info">
                                        <div className="title">{getReadableAchievement(type, t)}</div>
                                        <div className="date">
                                            {achievement
                                                ? t('mypage.unlockedOn', { date: new Date(achievement.unlocked_at).toLocaleDateString(locale) })
                                                : t('mypage.locked')}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="mypage-footer" style={{ marginTop: 'auto', display: 'flex', gap: '10px', width: '100%' }}>
                    <button
                        type="button"
                        className="btn-sign-out"
                        onClick={() => {
                            supabase.auth.signOut();
                            onClose();
                        }}
                        style={{
                            flex: 1,
                            padding: '10px',
                            background: 'linear-gradient(135deg, #555 0%, #222 100%)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: '12px',
                            color: '#ccc',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            fontSize: '0.85rem'
                        }}
                    >
                        {t('common.signOut')}
                    </button>
                    <button type="button" className="btn-close" onClick={onClose} style={{ flex: 1, margin: 0 }}>{t('common.close')}</button>
                </div>
            </div>
        </div>
    );
};

// Helper
const getReadableAchievement = (type: string, t: Translate) => {
    const key = `achievement.${type}`;
    const translated = t(key);
    return translated === key ? type.replace(/_/g, ' ') : translated;
};
