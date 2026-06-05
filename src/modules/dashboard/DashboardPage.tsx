/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { LuKeyRound } from "react-icons/lu";
import { FiLock } from "react-icons/fi";
import { FiTrendingUp } from "react-icons/fi";
import { Button } from "@shared/components/Button";
import { theme } from "@shared/theme";

export type DashboardSection = "passwords" | "finance";

interface DashboardPageProps {
    onSelect: (section: DashboardSection) => void;
    onLock: () => void;
}

/* ── page ─────────────────────────────────────────────────────────── */

const pageStyles = css({
    position: "relative",
    zIndex: 1,
    width: "100vw",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    overflowX: "hidden",
    overflowY: "auto",
});

/* ── header ───────────────────────────────────────────────────────── */

const headerStyles = css({
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "28px 48px",
    boxSizing: "border-box",
    flexShrink: 0,
});

const headingGroupStyles = css({
    display: "flex",
    flexDirection: "column",
    gap: 4,
});

const titleStyles = css({
    margin: 0,
    fontSize: 32,
    fontWeight: 700,
    color: theme.color.text,
    letterSpacing: "-0.5px",
    "& span": {
        background: `linear-gradient(120deg, ${theme.color.accentGlow}, ${theme.color.nebulaPink})`,
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
    },
});

const subtitleStyles = css({
    margin: 0,
    color: theme.color.textMuted,
    fontSize: 14,
});

/* ── cards grid ───────────────────────────────────────────────────── */

const gridStyles = css({
    flex: 1,
    display: "flex",
    flexDirection: "row",
    padding: "0 48px 48px",
    gap: 32,
    boxSizing: "border-box",
    minHeight: 0,
});

/* ── single card ──────────────────────────────────────────────────── */

const cardStyles = (disabled: boolean) =>
    css({
        flex: "1 1 0",
        display: "flex",
        flexDirection: "column",
        background: theme.color.bgElevated,
        border: `1px solid ${theme.color.border}`,
        borderRadius: theme.radius.lg,
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        boxShadow: theme.shadow.card,
        overflow: "hidden",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: `transform ${theme.transition.slow}, border-color ${theme.transition.base}, box-shadow ${theme.transition.base}`,
        ...(!disabled && {
            "&:hover": {
                transform: "translateY(-4px)",
                borderColor: theme.color.borderStrong,
                boxShadow: theme.shadow.glowStrong,
            },
        }),
    });

const cardTopStyles = (gradient: string) =>
    css({
        flex: 1,
        background: gradient,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 72,
        color: "rgba(255,255,255,0.9)",
        minHeight: 0,
    });

const cardDividerStyles = css({
    height: 1,
    background: theme.color.border,
    flexShrink: 0,
});

const cardBodyStyles = css({
    padding: "28px 36px 36px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    flexShrink: 0,
});

const cardTitleStyles = css({
    margin: 0,
    fontSize: 24,
    fontWeight: 700,
    color: theme.color.text,
});

const cardDescStyles = css({
    margin: 0,
    fontSize: 14,
    color: theme.color.textMuted,
    lineHeight: 1.65,
});

/* ── sub-component ────────────────────────────────────────────────── */

interface SectionCardProps {
    icon: React.ReactNode;
    title: string;
    description: string;
    gradient: string;
    cta: string;
    onOpen: () => void;
    disabled?: boolean;
}

function SectionCard({
    icon,
    title,
    description,
    gradient,
    cta,
    onOpen,
    disabled = false,
}: SectionCardProps) {
    return (
        <div css={cardStyles(disabled)} onClick={disabled ? undefined : onOpen}>
            <div css={cardTopStyles(gradient)}>{icon}</div>
            <div css={cardDividerStyles} />
            <div css={cardBodyStyles}>
                <h3 css={cardTitleStyles}>{title}</h3>
                <p css={cardDescStyles}>{description}</p>
                <Button variant="ghost" disabled={disabled} style={{ marginTop: 8 }}>
                    {cta}
                </Button>
            </div>
        </div>
    );
}

/* ── page component ───────────────────────────────────────────────── */

export function DashboardPage({ onSelect, onLock }: DashboardPageProps) {
    return (
        <main css={pageStyles}>
            <header css={headerStyles}>
                <div css={headingGroupStyles}>
                    <h1 css={titleStyles}>
                        Bienvenido a tu <span>Órbita Segura</span>
                    </h1>
                    <p css={subtitleStyles}>Selecciona un módulo para continuar.</p>
                </div>
                <Button variant="ghost" leftIcon={<FiLock />} onClick={onLock}>
                    Bloquear
                </Button>
            </header>

            <section css={gridStyles}>
                <SectionCard
                    icon={<LuKeyRound />}
                    title="Contraseñas"
                    description="Gestor cifrado al estilo KeePass: agrupa cuentas por categorías y consulta tablas detalladas."
                    gradient={`linear-gradient(135deg, ${theme.color.accentStrong}, ${theme.color.accentDeep})`}
                    cta="Abrir bóveda"
                    onOpen={() => onSelect("passwords")}
                />
                <SectionCard
                    icon={<FiTrendingUp />}
                    title="Finanzas"
                    description="Controla tus cuentas, gastos e ingresos con privacidad total. Todo cifrado, todo offline."
                    gradient={`linear-gradient(135deg, ${theme.color.nebulaPink}, ${theme.color.accentDeep})`}
                    cta="Abrir finanzas"
                    onOpen={() => onSelect("finance")}
                />
            </section>
        </main>
    );
}

export default DashboardPage;
