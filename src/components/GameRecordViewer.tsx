import React, { useMemo, useState } from 'react';
import type { BoardSkin, CardSkin, DiceSkin } from '../logic/types';
import { buildReplayBoards, getGameRecordResult, type GameRecordData } from '../logic/gameRecord';
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

export const GameRecordViewer: React.FC<GameRecordViewerProps> = ({
    record,
    onBack,
    selectedSkin,
    selectedCardSkin,
    selectedBoardSkin,
}) => {
    const [moveCount, setMoveCount] = useState(record.moves.length);

    const boards = useMemo(() => buildReplayBoards(record, moveCount), [moveCount, record]);
    const viewerIndex = record.viewerPlayerIndex;
    const opponentIndex = viewerIndex === 0 ? 1 : 0;
    const currentMove = moveCount > 0 ? record.moves[moveCount - 1] : null;
    const result = getGameRecordResult(record);
    const viewerName = record.playerNames[viewerIndex];
    const opponentName = record.playerNames[opponentIndex];

    const moveDescription = currentMove
        ? `${currentMove.ply}. ${record.playerNames[currentMove.playerIndex]} — ${RANK_LABELS[currentMove.card.rank] || currentMove.card.rank}${SUIT_LABELS[currentMove.card.suit]} → Column ${currentMove.column + 1}${currentMove.card.isHidden ? ' (Face Down)' : ''}`
        : 'Initial position';

    return (
        <div className="record-viewer">
            <div className="record-viewer-header">
                <button type="button" className="record-back-btn" onClick={onBack}>← Records</button>
                <div>
                    <span className={`record-result record-result-${result}`}>{result.toUpperCase()}</span>
                    <strong>{viewerName} vs {opponentName}</strong>
                </div>
                <time dateTime={record.completedAt}>{new Date(record.completedAt).toLocaleString()}</time>
            </div>

            <div className="record-scoreline" aria-label="Final score">
                <span>{record.playerNames[0]} <strong>{record.scores[0]}</strong></span>
                <span>–</span>
                <span><strong>{record.scores[1]}</strong> {record.playerNames[1]}</span>
            </div>

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

            <div className="record-move-copy" aria-live="polite">
                <span>MOVE {moveCount} / {record.moves.length}</span>
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
                <button type="button" onClick={() => setMoveCount(0)} disabled={moveCount === 0}>Start</button>
                <button type="button" onClick={() => setMoveCount(value => Math.max(0, value - 1))} disabled={moveCount === 0}>Previous</button>
                <button type="button" onClick={() => setMoveCount(value => Math.min(record.moves.length, value + 1))} disabled={moveCount === record.moves.length}>Next</button>
                <button type="button" onClick={() => setMoveCount(record.moves.length)} disabled={moveCount === record.moves.length}>End</button>
            </div>
        </div>
    );
};
