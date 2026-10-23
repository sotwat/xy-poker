import type { MatchRewards } from './matchRewards';

export interface RewardResponse { success?: boolean; rewards?: MatchRewards; retryAfterMs?: number }

export function submitRewardRecord(
    send: (done: (error: Error | null, response?: RewardResponse) => void) => void,
    isCurrent: () => boolean,
    onSaved: (rewards: MatchRewards) => void,
    onError: () => void,
) {
    let cancelled = false;
    let retried = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = () => {
        if (cancelled || !isCurrent()) return;
        send((error, response) => {
            if (cancelled || !isCurrent()) return;
            if (response?.rewards) { onSaved(response.rewards); return; }
            const wait = response?.retryAfterMs;
            if (!error && !retried && wait && Number.isFinite(wait) && wait > 0 && wait <= 30_000) {
                retried = true;
                timer = setTimeout(attempt, Math.ceil(wait) + 100);
            } else onError();
        });
    };
    attempt();
    return () => { cancelled = true; clearTimeout(timer); };
}
