import { writeText, clear } from "@tauri-apps/plugin-clipboard-manager";

/**
 * Copy `value` to the clipboard and clear it after `timeoutMs` by
 * overwriting with an empty string. Returns the timer id so callers can cancel.
 */
export function copyEphemeral(value: string, timeoutMs = 10_000): number {
    void writeText(value);
    return window.setTimeout(() => {
        void clear();
    }, timeoutMs);
}
