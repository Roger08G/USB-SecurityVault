import { useEffect, useRef } from "react";

/**
 * Calls `onIdle` after `timeoutMs` of no user activity.
 * Activity = pointer/keyboard/visibility events.
 * Restart by changing `enabled` to false then true again.
 */
export function useAutoLock(enabled: boolean, timeoutMs: number, onIdle: () => void): void {
    const cb = useRef(onIdle);
    cb.current = onIdle;

    useEffect(() => {
        if (!enabled) return;
        let timer = window.setTimeout(() => cb.current(), timeoutMs);
        const reset = () => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => cb.current(), timeoutMs);
        };
        const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;
        events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
        const onVis = () => {
            if (document.hidden) cb.current();
        };
        document.addEventListener("visibilitychange", onVis);
        return () => {
            window.clearTimeout(timer);
            events.forEach((e) => window.removeEventListener(e, reset));
            document.removeEventListener("visibilitychange", onVis);
        };
    }, [enabled, timeoutMs]);
}
