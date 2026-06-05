/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { theme } from "@shared/theme";

type Variant = "primary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
    size?: Size;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
    full?: boolean;
}

const base = css({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space(2),
    fontFamily: theme.font.sans,
    fontWeight: 500,
    border: "1px solid transparent",
    cursor: "pointer",
    transition: `all ${theme.transition.base}`,
    userSelect: "none",
    whiteSpace: "nowrap",
    "&:disabled": { opacity: 0.5, cursor: "not-allowed" },
});

const sizes: Record<Size, ReturnType<typeof css>> = {
    sm: css({ padding: "6px 12px", fontSize: 13, borderRadius: theme.radius.sm }),
    md: css({ padding: "10px 18px", fontSize: 14, borderRadius: theme.radius.md }),
    lg: css({ padding: "14px 24px", fontSize: 16, borderRadius: theme.radius.md }),
};

const variants: Record<Variant, ReturnType<typeof css>> = {
    primary: css({
        background: `linear-gradient(135deg, ${theme.color.accentStrong}, ${theme.color.accentDeep})`,
        color: "#fff",
        boxShadow: theme.shadow.glow,
        "&:hover:not(:disabled)": {
            boxShadow: theme.shadow.glowStrong,
            transform: "translateY(-1px)",
        },
    }),
    ghost: css({
        background: "transparent",
        color: theme.color.text,
        borderColor: theme.color.border,
        "&:hover:not(:disabled)": {
            borderColor: theme.color.borderStrong,
            background: theme.color.bgGlass,
        },
    }),
    danger: css({
        background: "transparent",
        color: theme.color.danger,
        borderColor: "rgba(248, 113, 113, 0.4)",
        "&:hover:not(:disabled)": { background: "rgba(248, 113, 113, 0.12)" },
    }),
    subtle: css({
        background: theme.color.bgGlass,
        color: theme.color.text,
        "&:hover:not(:disabled)": { background: "rgba(60, 35, 110, 0.55)" },
    }),
};

export function Button({
    variant = "primary",
    size = "md",
    leftIcon,
    rightIcon,
    full,
    children,
    ...rest
}: ButtonProps) {
    return (
        <button
            {...rest}
            css={[base, sizes[size], variants[variant], full && css({ width: "100%" })]}
        >
            {leftIcon}
            {children}
            {rightIcon}
        </button>
    );
}
