/**
 * Cosmic theme tokens — purple / dark / nebulae.
 * Use via `theme.color.x`, never hard-code colors in components.
 */
export const theme = {
    color: {
        bgDeep: '#05010f',
        bgSpace: '#0a0420',
        bgElevated: 'rgba(20, 12, 45, 0.72)',
        bgGlass: 'rgba(40, 22, 80, 0.35)',
        border: 'rgba(160, 120, 255, 0.18)',
        borderStrong: 'rgba(180, 140, 255, 0.45)',
        text: '#f3eefe',
        textMuted: '#a89cd6',
        textDim: '#6f6595',
        accent: '#a78bfa',         // violet-400
        accentStrong: '#8b5cf6',   // violet-500
        accentDeep: '#6d28d9',     // violet-700
        accentGlow: '#c4b5fd',
        nebulaPink: '#f472b6',
        nebulaCyan: '#67e8f9',
        success: '#34d399',
        danger: '#f87171',
        warn: '#fbbf24',
    },
    radius: {
        sm: '8px',
        md: '12px',
        lg: '18px',
        xl: '28px',
        pill: '999px',
    },
    space: (n: number) => `${n * 4}px`,
    font: {
        sans: "'Rubik', 'Segoe UI', Tahoma, sans-serif",
        mono: "'JetBrains Mono', 'Courier New', monospace",
    },
    shadow: {
        glow: '0 0 24px rgba(167, 139, 250, 0.35), 0 0 60px rgba(109, 40, 217, 0.25)',
        glowStrong: '0 0 32px rgba(167, 139, 250, 0.6), 0 0 80px rgba(124, 58, 237, 0.4)',
        card: '0 8px 32px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
    },
    transition: {
        fast: '120ms ease',
        base: '200ms ease',
        slow: '380ms cubic-bezier(.2,.8,.2,1)',
    },
} as const;

export type Theme = typeof theme;
