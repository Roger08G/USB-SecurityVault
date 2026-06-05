/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { ReactNode } from "react";
import { theme } from "@shared/theme";

interface PageShellProps {
    children: ReactNode;
    centered?: boolean;
    maxWidth?: number;
}

const shell = (centered: boolean, maxWidth: number) =>
    css({
        position: "relative",
        zIndex: 1,
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: centered ? "center" : "stretch",
        justifyContent: centered ? "center" : "flex-start",
        padding: theme.space(8),
        "& > .inner": {
            width: "100%",
            maxWidth,
        },
    });

export function PageShell({ children, centered = false, maxWidth = 1200 }: PageShellProps) {
    return (
        <main css={shell(centered, maxWidth)}>
            <div className="inner">{children}</div>
        </main>
    );
}
