/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { ReactNode } from "react";
import { theme } from "@shared/theme";

interface CardProps {
    children: ReactNode;
    padding?: number;
    noPadding?: boolean;
    onClick?: () => void;
    hoverable?: boolean;
    glow?: boolean;
}

const baseStyles = (padding: number, hoverable: boolean, glow: boolean, noPadding: boolean) =>
    css({
        position: "relative",
        padding: noPadding ? 0 : theme.space(padding),
        overflow: noPadding ? "hidden" : undefined,
        background: theme.color.bgElevated,
        border: `1px solid ${theme.color.border}`,
        borderRadius: theme.radius.lg,
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        boxShadow: glow ? theme.shadow.glow : theme.shadow.card,
        transition: `transform ${theme.transition.slow}, border-color ${theme.transition.base}, box-shadow ${theme.transition.base}`,
        cursor: hoverable ? "pointer" : "default",
        ...(hoverable && {
            "&:hover": {
                transform: "translateY(-6px)",
                borderColor: theme.color.borderStrong,
                boxShadow: theme.shadow.glowStrong,
            },
        }),
    });

export function Card({
    children,
    padding = 6,
    noPadding = false,
    onClick,
    hoverable = false,
    glow = false,
}: CardProps) {
    return (
        <div css={baseStyles(padding, hoverable, glow, noPadding)} onClick={onClick}>
            {children}
        </div>
    );
}
