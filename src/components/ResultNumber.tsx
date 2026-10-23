import { LetteringText } from './LetteringText';

export function ResultNumber({ from = 0, to, signed = false }: { from?: number; to: number; signed?: boolean }) {
    const digits = String(Math.max(Math.abs(from), Math.abs(to))).length;
    return <span className="result-number" data-number-from={from} data-number-to={to} role="img" aria-label={`${signed && to > 0 ? '+' : ''}${to}`}>
        {(signed || to < 0) && <span aria-hidden="true"><LetteringText>{to < 0 ? '−' : '+'}</LetteringText></span>}
        {String(Math.abs(to)).padStart(digits, '0').split('').map((digit, position) => <span className="result-digit" key={position} aria-hidden="true">
            <span className="result-digit-strip" style={{ transform: `translateY(-${Number(digit) * 10}%)` }}>
                {Array.from({ length: 10 }, (_, n) => <span key={n}><LetteringText>{String(n)}</LetteringText></span>)}
            </span>
        </span>)}
    </span>;
}
