/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useEffect, useState } from "react";
import { FiLock, FiShield, FiCopy, FiCheck } from "react-icons/fi";
import { LuKeyRound } from "react-icons/lu";
import { HiOutlineRocketLaunch } from "react-icons/hi2";
import { QRCodeSVG } from "qrcode.react";
import { api, VaultError } from "@shared/api";
import { Button } from "@shared/components/Button";
import { Input } from "@shared/components/Input";
import { Card } from "@shared/components/Card";
import { BrandMark } from "@shared/components/BrandMark";
import { theme } from "@shared/theme";

interface AuthPageProps {
    onUnlocked: () => void;
}

type Phase = "loading" | "init" | "password" | "totp" | "show-secret";

const pageStyles = css({
    position: "relative",
    zIndex: 1,
    width: "100vw",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "32px 24px",
    boxSizing: "border-box",
    overflowY: "auto",
});

const innerStyles = (wide: boolean) =>
    css({
        width: "100%",
        maxWidth: wide ? 500 : 420,
        display: "flex",
        flexDirection: "column",
    });

const formStyles = css({
    display: "flex",
    flexDirection: "column",
    gap: theme.space(4),
});

const errorStyles = css({
    color: theme.color.danger,
    fontSize: 13,
    textAlign: "center",
    minHeight: 18,
});

const helpStyles = css({
    color: theme.color.textMuted,
    fontSize: 13,
    lineHeight: 1.55,
    textAlign: "center",
});

const qrWrapStyles = css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: theme.space(5),
});

const qrFrameStyles = css({
    background: "#ffffff",
    padding: 16,
    borderRadius: theme.radius.lg,
    boxShadow: theme.shadow.glowStrong,
    lineHeight: 0,
});

const stepsStyles = css({
    display: "flex",
    flexDirection: "column",
    gap: theme.space(2),
    width: "100%",
    background: "rgba(0,0,0,0.3)",
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.radius.md,
    padding: theme.space(4),
});

const stepItemStyles = css({
    display: "flex",
    gap: theme.space(2),
    alignItems: "flex-start",
    fontSize: 13,
    color: theme.color.textMuted,
    lineHeight: 1.5,
    "& b": { color: theme.color.text },
});

const stepNumStyles = css({
    flexShrink: 0,
    width: 20,
    height: 20,
    borderRadius: "50%",
    background: theme.color.accentDeep,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 700,
    color: "#fff",
    marginTop: 1,
});

const toggleStyles = css({
    background: "none",
    border: "none",
    cursor: "pointer",
    color: theme.color.accent,
    fontSize: 13,
    textDecoration: "underline",
    textUnderlineOffset: 3,
    padding: 0,
    fontFamily: "inherit",
    "&:hover": { color: theme.color.accentGlow },
});

// warningStyles removed (unused)

function describeError(err: unknown): string {
    if (err instanceof VaultError) {
        switch (err.detail.kind) {
            case "invalid":
                return "Credenciales incorrectas.";
            case "rate_limited":
                return `Demasiados intentos. Espera ${Math.ceil(err.detail.seconds / 60)} min.`;
            case "locked":
                return "Bóveda bloqueada.";
            case "not_initialized":
                return "La bóveda no existe.";
            case "already_initialized":
                return "La bóveda ya existe.";
            default:
                return "Error interno.";
        }
    }
    return "Error inesperado.";
}

export function AuthPage({ onUnlocked }: AuthPageProps) {
    const [phase, setPhase] = useState<Phase>("loading");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [code, setCode] = useState("");
    const [copied, setCopied] = useState(false);
    const [stepsOpen, setStepsOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [otpauth, setOtpauth] = useState<string | null>(null);

    useEffect(() => {
        api.status()
            .then((s) => setPhase(s.initialized ? "password" : "init"))
            .catch(() => setPhase("init"));
    }, []);

    const submitInit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (password.length < 12) return setError("Mínimo 12 caracteres.");
        if (password !== confirm) return setError("Las contraseñas no coinciden.");
        setBusy(true);
        try {
            const res = await api.init(password);
            setOtpauth(res.otpauth_uri);
            setPhase("show-secret");
        } catch (err) {
            setError(describeError(err));
        } finally {
            setBusy(false);
        }
    };

    const submitPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
            await api.unlock(password);
            setPassword("");
            setPhase("totp");
        } catch (err) {
            setError(describeError(err));
        } finally {
            setBusy(false);
        }
    };

    const submitTotp = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
            await api.verifyTotp(code);
            setCode("");
            onUnlocked();
        } catch (err) {
            setError(describeError(err));
            setPhase("password");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div css={pageStyles}>
            <div css={innerStyles(phase === "show-secret")}>
                <BrandMark icon={<HiOutlineRocketLaunch />} />
                <Card padding={7} glow>
                    {phase === "loading" && <p css={helpStyles}>Conectando con la bóveda…</p>}

                    {phase === "init" && (
                        <form css={formStyles} onSubmit={submitInit}>
                            <p css={helpStyles}>
                                Crea tu bóveda. Esta contraseña <b>no se puede recuperar</b>.
                            </p>
                            <Input
                                type="password"
                                label="Contraseña maestra"
                                placeholder="Mínimo 12 caracteres"
                                leftIcon={<FiLock />}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoFocus
                                monospace
                            />
                            <Input
                                type="password"
                                label="Confirmar"
                                placeholder="Repite la contraseña"
                                leftIcon={<FiLock />}
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                                monospace
                            />
                            <div css={errorStyles}>{error}</div>
                            <Button type="submit" full disabled={busy}>
                                {busy ? "Creando…" : "Crear bóveda"}
                            </Button>
                        </form>
                    )}

                    {phase === "show-secret" && otpauth && (
                        <div css={qrWrapStyles}>
                            <p css={helpStyles}>
                                Escanea este QR con la app <b>Contraseñas</b> de tu iPhone para
                                activar el 2FA.
                            </p>

                            <div css={qrFrameStyles}>
                                <QRCodeSVG
                                    value={otpauth}
                                    size={220}
                                    level="M"
                                    bgColor="#ffffff"
                                    fgColor="#1a0a3a"
                                />
                            </div>

                            <button
                                css={toggleStyles}
                                type="button"
                                onClick={() => setStepsOpen((v) => !v)}
                            >
                                {stepsOpen ? "Ocultar pasos" : "Ver pasos →"}
                            </button>

                            {stepsOpen && (
                                <div css={stepsStyles}>
                                    <div css={stepItemStyles}>
                                        <span css={stepNumStyles}>1</span>
                                        <span>
                                            Abre la app <b>Contraseñas</b> (icono de llave, iOS 18+)
                                        </span>
                                    </div>
                                    <div css={stepItemStyles}>
                                        <span css={stepNumStyles}>2</span>
                                        <span>
                                            Pulsa <b>+</b> → rellena nombre y usuario
                                        </span>
                                    </div>
                                    <div css={stepItemStyles}>
                                        <span css={stepNumStyles}>3</span>
                                        <span>
                                            En <b>Código de verificación</b>, pulsa el icono de QR
                                        </span>
                                    </div>
                                    <div css={stepItemStyles}>
                                        <span css={stepNumStyles}>4</span>
                                        <span>
                                            Apunta la cámara <b>desde ahí</b> a este QR
                                        </span>
                                    </div>
                                </div>
                            )}

                            <Button
                                variant="ghost"
                                size="sm"
                                leftIcon={copied ? <FiCheck /> : <FiCopy />}
                                onClick={() => {
                                    void navigator.clipboard.writeText(otpauth);
                                    setCopied(true);
                                    window.setTimeout(() => setCopied(false), 2000);
                                }}
                            >
                                {copied ? "Copiado" : "Copiar URI manualmente"}
                            </Button>

                            <Button
                                full
                                onClick={() => {
                                    setOtpauth(null);
                                    setPhase("password");
                                }}
                            >
                                Ya lo he añadido — continuar
                            </Button>
                        </div>
                    )}

                    {phase === "password" && (
                        <form css={formStyles} onSubmit={submitPassword}>
                            <Input
                                type="password"
                                label="Contraseña maestra"
                                placeholder="••••••••"
                                leftIcon={<FiLock />}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoFocus
                                monospace
                            />
                            <div css={errorStyles}>{error}</div>
                            <Button type="submit" full disabled={busy}>
                                {busy ? "Verificando…" : "Desbloquear"}
                            </Button>
                        </form>
                    )}

                    {phase === "totp" && (
                        <form css={formStyles} onSubmit={submitTotp}>
                            <p css={helpStyles}>
                                Introduce el código de 6 dígitos de tu app autenticadora.
                            </p>
                            <Input
                                inputMode="numeric"
                                maxLength={6}
                                label="Código TOTP"
                                placeholder="123 456"
                                leftIcon={<FiShield />}
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                                autoFocus
                                monospace
                            />
                            <div css={errorStyles}>{error}</div>
                            <Button
                                type="submit"
                                full
                                leftIcon={<LuKeyRound />}
                                disabled={busy || code.length < 6}
                            >
                                {busy ? "Verificando…" : "Acceder"}
                            </Button>
                        </form>
                    )}
                </Card>
            </div>
        </div>
    );
}

export default AuthPage;
