import React, { useMemo, useState } from 'react';
import type { BoardSkin, Card as CardType, CardSkin, DiceSkin } from '../logic/types';
import {
    buildReplayBoards,
    buildReplayHands,
    getGameRecordExportFilename,
    getGameRecordResult,
    serializeGameRecordText,
    type GameRecordData,
} from '../logic/gameRecord';
import { Card } from './Card';
import { SharedBoard } from './SharedBoard';
import './GameRecordViewer.css';
import { useI18n } from '../i18n';

interface GameRecordViewerProps {
    record: GameRecordData;
    onBack: () => void;
    selectedSkin: DiceSkin;
    selectedCardSkin: CardSkin;
    selectedBoardSkin: BoardSkin;
}

const RANK_LABELS: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const SUIT_LABELS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' } as const;

interface ReplayHandProps {
    cards: CardType[];
    name: string;
    playerIndex: 0 | 1;
    isNext: boolean;
    selectedCardSkin: CardSkin;
}

const ReplayHand: React.FC<ReplayHandProps> = ({
    cards,
    name,
    playerIndex,
    isNext,
    selectedCardSkin,
}) => {
    const { t } = useI18n();
    return (
        <section className={`record-hand-panel record-player-${playerIndex + 1} ${isNext ? 'is-next' : ''}`}>
            <div className="record-hand-heading">
                <span className="record-player-dot" aria-hidden="true" />
                <strong>{name}</strong>
                <span>{t('common.cards', { count: cards.length })}</span>
                {isNext && <em>{t('record.next')}</em>}
            </div>
            <div className="record-hand-cards" aria-label={t('record.handAria', { name })}>
                {cards.map(card => (
                    <div className="record-hand-card" key={card.id}>
                        <Card card={{ ...card, isHidden: false }} skin={selectedCardSkin} />
                    </div>
                ))}
            </div>
        </section>
    );
};

export const GameRecordViewer: React.FC<GameRecordViewerProps> = ({
    record,
    onBack,
    selectedSkin,
    selectedCardSkin,
    selectedBoardSkin,
}) => {
    const { language, t, locale } = useI18n();
    const [moveCount, setMoveCount] = useState(record.moves.length);

    const boards = useMemo(() => buildReplayBoards(record, moveCount), [moveCount, record]);
    const hands = useMemo(() => buildReplayHands(record, moveCount), [moveCount, record]);
    const viewerIndex = record.viewerPlayerIndex;
    const opponentIndex = viewerIndex === 0 ? 1 : 0;
    const currentMove = moveCount > 0 ? record.moves[moveCount - 1] : null;
    const currentMoveV2 = record.schemaVersion !== 1 && moveCount > 0 ? record.moves[moveCount - 1] : null;
    const currentThought = record.schemaVersion === 3 && moveCount > 0
        ? record.moves[moveCount - 1].thought
        : undefined;
    const result = getGameRecordResult(record);
    const viewerName = record.playerNames[viewerIndex];
    const opponentName = record.playerNames[opponentIndex];
    const nextPlayerIndex = moveCount < record.moves.length ? record.moves[moveCount].playerIndex : null;

    const drawnDescription = currentMoveV2?.drawnCards.length
        ? t('record.drawCards', { cards: currentMoveV2.drawnCards.map(card => `${RANK_LABELS[card.rank] || card.rank}${SUIT_LABELS[card.suit]}`).join(', ') })
        : '';

    const moveDescription = currentMove
        ? `${t('record.move', {
            name: record.playerNames[currentMove.playerIndex],
            card: `${RANK_LABELS[currentMove.card.rank] || currentMove.card.rank}${SUIT_LABELS[currentMove.card.suit]}`,
            column: currentMove.column + 1,
            row: currentMove.row + 1,
        })}${currentMove.card.isHidden ? t('record.faceDown') : ''}${drawnDescription}`
        : t('record.initial');

    const resultLabel = result === 'win' ? t('record.win') : result === 'loss' ? t('record.loss') : t('record.draw');

    const exportAsText = () => {
        const blob = new Blob(['\uFEFF', serializeGameRecordText(record, language)], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = getGameRecordExportFilename(record);
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
    };

    return (
        <div className="record-viewer">
            <div className="record-viewer-header">
                <div className="record-header-actions">
                    <button type="button" className="record-back-btn" onClick={onBack}>← {t('record.back')}</button>
                    <button
                        type="button"
                        className="record-export-btn"
                        onClick={exportAsText}
                        aria-label={t('record.exportAria')}
                    >
                        ↓ {t('record.exportTxt')}
                    </button>
                </div>
                <div className="record-match-meta">
                    <span className={`record-result record-result-${result}`}>{resultLabel}</span>
                    <strong>{viewerName} {t('common.vs')} {opponentName}</strong>
                </div>
                <time dateTime={record.completedAt}>{new Date(record.completedAt).toLocaleString(locale)}</time>
            </div>

            <div className="record-scoreline" aria-label={t('record.finalScore')}>
                <span className="record-player-1">{record.playerNames[0]} <strong>{record.scores[0]}</strong></span>
                <span>–</span>
                <span className="record-player-2"><strong>{record.scores[1]}</strong> {record.playerNames[1]}</span>
            </div>

            <div className="record-stage">
                {hands ? (
                    <ReplayHand
                        cards={hands[opponentIndex]}
                        name={opponentName}
                        playerIndex={opponentIndex}
                        isNext={nextPlayerIndex === opponentIndex}
                        selectedCardSkin={selectedCardSkin}
                    />
                ) : (
                    <div className="record-hands-unavailable">{t('record.legacy')}</div>
                )}

                <div className="record-board-wrap">
                    <SharedBoard
                        playerBoard={boards[viewerIndex]}
                        opponentBoard={boards[opponentIndex]}
                        dice={record.dice}
                        onColumnClick={() => undefined}
                        isCurrentPlayer={false}
                        revealAll
                        bottomPlayerId={viewerIndex === 0 ? 'p1' : 'p2'}
                        selectedSkin={selectedSkin}
                        selectedCardSkin={selectedCardSkin}
                        selectedBoardSkin={selectedBoardSkin}
                    />
                </div>

                {hands && (
                    <ReplayHand
                        cards={hands[viewerIndex]}
                        name={viewerName}
                        playerIndex={viewerIndex}
                        isNext={nextPlayerIndex === viewerIndex}
                        selectedCardSkin={selectedCardSkin}
                    />
                )}
            </div>

            <div className="record-move-copy" aria-live="polite">
                <span>{t('record.position', { current: moveCount, total: record.moves.length })}</span>
                <strong>{moveDescription}</strong>
            </div>

            {currentThought && (
                <div className="record-thought-note">
                    <span>PRO</span>
                    <div>
                        <strong>{t('record.thought')}</strong>
                        <p>{currentThought}</p>
                    </div>
                </div>
            )}

            <input
                className="record-scrubber"
                type="range"
                min="0"
                max={record.moves.length}
                value={moveCount}
                onChange={event => setMoveCount(Number(event.target.value))}
                aria-label={t('record.replay')}
            />

            <div className="record-controls">
                <button type="button" aria-label={t('record.start')} onClick={() => setMoveCount(0)} disabled={moveCount === 0}>{t('record.start')}</button>
                <button type="button" aria-label={t('record.previous')} onClick={() => setMoveCount(value => Math.max(0, value - 1))} disabled={moveCount === 0}>{t('record.previous')}</button>
                <button type="button" aria-label={t('record.nextButton')} onClick={() => setMoveCount(value => Math.min(record.moves.length, value + 1))} disabled={moveCount === record.moves.length}>{t('record.nextButton')}</button>
                <button type="button" aria-label={t('record.end')} onClick={() => setMoveCount(record.moves.length)} disabled={moveCount === record.moves.length}>{t('record.end')}</button>
            </div>
        </div>
    );
};
