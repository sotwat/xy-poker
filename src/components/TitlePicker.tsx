import { useEffect, useState } from 'react';
import { TITLES, cosmeticCondition } from '../logic/progression';
import { equipTitle, loadProgression, type ProgressionInventory } from '../logic/progressionStorage';
import { LetteringText } from './LetteringText';
import './TitlePicker.css';
export function TitlePicker({ userId, showHeading = true }: { userId?: string; showHeading?: boolean }) {
    const [inventory, setInventory] = useState<ProgressionInventory | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        let cancelled = false;
        void loadProgression(userId).then(data => { if (!cancelled) setInventory(data); }).catch(() => { if (!cancelled) setError('Titles unavailable'); });
        return () => { cancelled = true; };
    }, [userId]);
    const select = async (id: string | null) => {
        setBusy(true); setError('');
        try { await equipTitle(id, userId); setInventory(prev => prev ? { ...prev, selectedTitle: id } : prev); }
        catch { setError('Unable to save title'); }
        finally { setBusy(false); }
    };
    return <section className="title-picker" aria-label="Titles">
        {showHeading && <h3><LetteringText>TITLES</LetteringText></h3>}
        {error && <p role="alert">{error}</p>}
        {!inventory && !error && <span><LetteringText>Loading…</LetteringText></span>}
        {inventory && <div className="title-options">
            <button disabled={busy} aria-pressed={!inventory.selectedTitle} onClick={() => void select(null)}><LetteringText>NONE</LetteringText></button>
            {TITLES.map(item => <button key={item.id} disabled={busy || !inventory.titles.includes(item.id)} aria-pressed={inventory.selectedTitle === item.id} onClick={() => void select(item.id)}>
                <strong><LetteringText>{item.name}</LetteringText></strong>
                <small><LetteringText>{cosmeticCondition(item)}</LetteringText></small>
            </button>)}
        </div>}
    </section>;
}
