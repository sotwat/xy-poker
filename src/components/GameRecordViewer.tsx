import React, { useMemo, useState } from 'react';
import type { BoardSkin, Card as CardType, CardSkin, DiceSkin } from '../logic/types';
import { buildReplayBoards, buildReplayHands, getGameRecordResult, type GameRecordData } from '../logic/gameRecord';
import { Card } from './Card';
import { SharedBoard } from './SharedBoard';
import './GameRecordViewer.css';

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
}) => (
    <section className={`record-hand-panel record-player-${playerIndex + 1} ${isNext ? 'is-next' : ''}`}>
        <div className="record-hand-heading">
            <span className="record-player-dot" aria-hidden="true" />
            <strong>{name}</strong>
            <span>{cards.length} cards</span>
            {isNext && <em>NEXT</em>}
        </div>
        <div className="record-hand-cards" aria-label={`${name}'s hand at this move`}>
            {cards.map(card => (
                <div className="record-hand-card" key={card.id}>
                    <Card card={{ ...card, isHidden: false }} skin={selectedCardSkin} />
                </div>
            ))}
        </div>
    </section>
);

export const GameRecordViewer: React.FC<GameRecordViewerProps> = ({
    record,
    onBack,
    selectedSkin,
    selectedCardSkin,
    selectedBoardSkin,
}) => {
    const [moveCount, setMoveCount] = useState(record.moves.length);

    const boards = useMemo(() => buildReplayBoards(record, moveCount), [moveCount, record]);
    const hands = useMemo(() => buildReplayHands(record, moveCount), [moveCount, record]);
    const viewerIndex = record.viewerPlayerIndex;
    const opponentIndex = viewerIndex === 0 ? 1 : 0;
    const currentMove = moveCount > 0 ? record.moves[moveCount - 1] : null;
    const currentMoveV2 = record.schemaVersion === 2 && moveCount > 0 ? record.moves[moveCount - 1] : null;
    const result = getGameRecordResult(record);
    const viewerName = record.playerNames[viewerIndex];
    const opponentName = record.playerNames[opponentIndex];
    const nextPlayerIndex = moveCount < record.moves.length ? record.moves[moveCount].playerIndex : null;

    const drawnDescription = currentMoveV2?.drawnCards.length
        ? ` · Draw ${currentMoveV2.drawnCards.map(card => `${RANK_LABELS[card.rank] || card.rank}${SUIT_LABELS[card.suit]}`).join(', ')}`
        : '';

    const moveDescription = currentMove
        ? `${record.playerNames[currentMove.playerIndex]} · ${RANK_LABELS[currentMove.card.rank] || currentMove.card.rank}${SUIT_LABELS[currentMove.card.suit]} → Column ${currentMove.column + 1}, Row ${currentMove.row + 1}${currentMove.card.isHidden ? ' · Face Down' : ''}${drawnDescription}`
        : 'Initial position';

    return (
        <div className="record-viewer">
            <div className="record-viewer-header">
                <button type="button" className="record-back-btn" onClick={onBack}>← Records</button>
                <div className="record-match-meta">
                    <span className={`record-result record-result-${result}`}>{result.toUpperCase()}</span>
                    <strong>{viewerName} vs {opponentName}</strong>
                </div>
                <time dateTime={record.completedAt}>{new Date(record.completedAt).toLocaleString()}</time>
            </div>

            <div className="record-scoreline" aria-label="Final score">
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
                    <div className="record-hands-unavailable">This legacy record does not contain hand data.</div>
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
                <span>POSITION {moveCount} / {record.moves.length}</span>
                <strong>{moveDescription}</strong>
            </div>

            <input
                className="record-scrubber"
                type="range"
                min="0"
                max={record.moves.length}
                value={moveCount}
                onChange={event => setMoveCount(Number(event.target.value))}
                aria-label="Replay move"
            />

            <div className="record-controls">
                <button type="button" aria-label="Go to initial position" onClick={() => setMoveCount(0)} disabled={moveCount === 0}>Start</button>
                <button type="button" aria-label="Previous move" onClick={() => setMoveCount(value => Math.max(0, value - 1))} disabled={moveCount === 0}>Previous</button>
                <button type="button" aria-label="Next move" onClick={() => setMoveCount(value => Math.min(record.moves.length, value + 1))} disabled={moveCount === record.moves.length}>Next</button>
                <button type="button" aria-label="Go to final position" onClick={() => setMoveCount(record.moves.length)} disabled={moveCount === record.moves.length}>End</button>
            </div>
        </div>
    );
};
