/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useEffect, useRef, useState } from "react";
import { FiArrowLeft, FiPlus, FiUsers, FiTrash2, FiImage, FiAlertTriangle } from "react-icons/fi";
import { api } from "@shared/api";
import type { GroupSummary } from "@shared/types";
import { Button } from "@shared/components/Button";
import { Input } from "@shared/components/Input";
import { Modal } from "@shared/components/Modal";
import { theme } from "@shared/theme";
import {
    extractIconName,
    iconBytesToDataUrl,
    resolveIconSrc,
    toIconRef,
    type IconSources,
} from "@shared/iconAssets";

interface GroupsPageProps {
    onBack: () => void;
    onOpenGroup: (group: GroupSummary) => void;
}

/* ── page layout ──────────────────────────────────────────────────── */

const pageStyles = css({
    position: "relative",
    zIndex: 1,
    minHeight: "100vh",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    padding: "48px 56px",
    boxSizing: "border-box",
});

const headerStyles = css({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 48,
});

const titleStyles = css({
    margin: 0,
    fontSize: 30,
    fontWeight: 700,
    color: theme.color.text,
    letterSpacing: "-0.5px",
});

const gridStyles = css({
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: 32,
    alignContent: "start",
});

const emptyStyles = css({
    color: theme.color.textMuted,
    fontSize: 15,
    marginTop: 32,
});

/* ── card ─────────────────────────────────────────────────────────── */

const gradients = [
    `linear-gradient(135deg, #2a0a5e 0%, #0d1b4b 100%)`,
    `linear-gradient(135deg, #0a3d3d 0%, #0d1b4b 100%)`,
    `linear-gradient(135deg, #3d0a2a 0%, #1b0d3a 100%)`,
    `linear-gradient(135deg, #1a2e0a 0%, #0d1b4b 100%)`,
    `linear-gradient(135deg, #3d2a0a 0%, #1b0d2a 100%)`,
];

const cardStyles = (deleteMode: boolean) =>
    css({
        position: "relative",
        borderRadius: theme.radius.lg,
        overflow: "hidden",
        background: theme.color.bgElevated,
        border: `1px solid ${deleteMode ? theme.color.danger : theme.color.border}`,
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        boxShadow: deleteMode ? `0 0 0 2px ${theme.color.danger}33` : theme.shadow.card,
        cursor: "pointer",
        transition: `transform ${theme.transition.slow}, border-color ${theme.transition.base}, box-shadow ${theme.transition.base}`,
        "&:hover": {
            transform: "translateY(-6px)",
            borderColor: deleteMode ? theme.color.danger : theme.color.borderStrong,
            boxShadow: deleteMode ? `0 0 0 3px ${theme.color.danger}55` : theme.shadow.glowStrong,
        },
    });

const cardImageStyles = (idx: number) =>
    css({
        height: 200,
        width: "100%",
        background: gradients[idx % gradients.length],
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: theme.color.accentGlow,
        fontSize: 64,
        overflow: "hidden",
        "& img": { width: "100%", height: "100%", objectFit: "cover" },
    });

const cardDividerStyles = css({ height: 1, background: theme.color.border });

const cardInfoStyles = css({
    padding: "20px 24px 24px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
});

const cardTitleStyles = css({ margin: 0, fontSize: 20, fontWeight: 700, color: theme.color.text });
const cardDescStyles = css({
    margin: 0,
    fontSize: 14,
    color: theme.color.textMuted,
    lineHeight: 1.55,
});
const cardCountStyles = css({
    marginTop: 8,
    fontSize: 12,
    color: theme.color.accent,
    fontFamily: theme.font.mono,
    letterSpacing: "0.04em",
});

const deleteBadgeStyles = css({
    position: "absolute",
    top: 12,
    right: 12,
    background: theme.color.danger,
    color: "#fff",
    borderRadius: "50%",
    width: 32,
    height: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
    boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
});

/* ── image upload ─────────────────────────────────────────────────── */

const uploadAreaStyles = css({
    border: `2px dashed ${theme.color.border}`,
    borderRadius: theme.radius.md,
    height: 140,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    cursor: "pointer",
    transition: `border-color ${theme.transition.base}, background ${theme.transition.base}`,
    color: theme.color.textMuted,
    fontSize: 13,
    overflow: "hidden",
    "&:hover": { borderColor: theme.color.accent, background: "rgba(139,92,246,0.06)" },
    "& img": { width: "100%", height: "100%", objectFit: "cover" },
});

/* ── confirm modal ────────────────────────────────────────────────── */

const confirmBodyStyles = css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: theme.space(4),
    textAlign: "center",
    padding: `${theme.space(2)} 0`,
});

const confirmIconStyles = css({
    fontSize: 48,
    color: theme.color.danger,
});

const confirmTextStyles = css({
    color: theme.color.textMuted,
    fontSize: 14,
    lineHeight: 1.6,
    "& b": { color: theme.color.text },
});

const confirmActionsStyles = css({
    display: "flex",
    gap: theme.space(3),
    width: "100%",
    marginTop: theme.space(2),
});

/* ── modal form ───────────────────────────────────────────────────── */

const formStyles = css({ display: "flex", flexDirection: "column", gap: theme.space(4) });

/* ── component ────────────────────────────────────────────────────── */

export function GroupsPage({ onBack, onOpenGroup }: GroupsPageProps) {
    const [groups, setGroups] = useState<GroupSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [deleteMode, setDeleteMode] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<GroupSummary | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [name, setName] = useState("");
    const [desc, setDesc] = useState("");
    const [bannerIconRef, setBannerIconRef] = useState<string | null>(null);
    const [iconSources, setIconSources] = useState<IconSources>({});
    const fileInputRef = useRef<HTMLInputElement>(null);

    const refresh = () => {
        setLoading(true);
        api.listGroups()
            .then(setGroups)
            .finally(() => setLoading(false));
    };

    useEffect(refresh, []);

    useEffect(() => {
        const missing = Array.from(
            new Set(
                groups
                    .map((group) => extractIconName(group.icon))
                    .filter((name): name is string => Boolean(name)),
            ),
        ).filter((name) => !iconSources[name]);

        if (missing.length === 0) {
            return;
        }

        let cancelled = false;
        void Promise.all(
            missing.map(async (name) => {
                try {
                    const icon = await api.readIcon(name);
                    return [name, iconBytesToDataUrl(icon)] as const;
                } catch {
                    return null;
                }
            }),
        ).then((items) => {
            if (cancelled) {
                return;
            }
            const loaded = items.filter((item): item is readonly [string, string] => Boolean(item));
            if (loaded.length > 0) {
                setIconSources((current) => ({ ...current, ...Object.fromEntries(loaded) }));
            }
        });

        return () => {
            cancelled = true;
        };
    }, [groups, iconSources]);

    const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        // Save to disk
        const arrayBuf = await file.arrayBuffer();
        const bytes = Array.from(new Uint8Array(arrayBuf));
        const safeName = await api.saveIcon(file.name, bytes);
        const icon = await api.readIcon(safeName);
        setIconSources((current) => ({ ...current, [safeName]: iconBytesToDataUrl(icon) }));
        setBannerIconRef(toIconRef(safeName));
    };

    const submitCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        await api.createGroup(name.trim(), desc.trim(), bannerIconRef);
        setName("");
        setDesc("");
        setBannerIconRef(null);
        setCreating(false);
        refresh();
    };

    const handleCardClick = (g: GroupSummary) => {
        if (deleteMode) {
            setPendingDelete(g);
        } else {
            onOpenGroup(g);
        }
    };

    const confirmDelete = async () => {
        if (!pendingDelete) return;
        setDeleting(true);
        try {
            await api.deleteGroup(pendingDelete.id);
            setPendingDelete(null);
            setDeleteMode(false);
            refresh();
        } finally {
            setDeleting(false);
        }
    };

    return (
        <main css={pageStyles}>
            <header css={headerStyles}>
                <div css={{ display: "flex", alignItems: "center", gap: theme.space(3) }}>
                    <Button variant="ghost" size="sm" leftIcon={<FiArrowLeft />} onClick={onBack}>
                        Volver
                    </Button>
                    <h1 css={titleStyles}>Categorías</h1>
                </div>
                <div css={{ display: "flex", gap: theme.space(3) }}>
                    <Button
                        variant={deleteMode ? "danger" : "ghost"}
                        leftIcon={<FiTrash2 />}
                        onClick={() => setDeleteMode((v) => !v)}
                    >
                        {deleteMode ? "Cancelar" : "Eliminar"}
                    </Button>
                    <Button leftIcon={<FiPlus />} onClick={() => setCreating(true)}>
                        Nueva categoría
                    </Button>
                </div>
            </header>

            {loading ? (
                <p css={emptyStyles}>Cargando…</p>
            ) : groups.length === 0 ? (
                <p css={emptyStyles}>No hay categorías todavía. Crea la primera.</p>
            ) : (
                <section css={gridStyles}>
                    {groups.map((g, idx) => (
                        <article
                            key={g.id}
                            css={cardStyles(deleteMode)}
                            onClick={() => handleCardClick(g)}
                        >
                            {deleteMode && (
                                <div css={deleteBadgeStyles}>
                                    <FiTrash2 />
                                </div>
                            )}
                            <div css={cardImageStyles(idx)}>
                                {resolveIconSrc(g.icon, iconSources) ? (
                                    <img
                                        src={resolveIconSrc(g.icon, iconSources) ?? ""}
                                        alt={g.name}
                                    />
                                ) : (
                                    <FiUsers />
                                )}
                            </div>
                            <div css={cardDividerStyles} />
                            <div css={cardInfoStyles}>
                                <h3 css={cardTitleStyles}>{g.name}</h3>
                                <p css={cardDescStyles}>{g.description || "Sin descripción."}</p>
                                <span css={cardCountStyles}>{g.entry_count} cuentas</span>
                            </div>
                        </article>
                    ))}
                </section>
            )}

            {/* ── Create modal ── */}
            <Modal
                open={creating}
                onClose={() => {
                    setCreating(false);
                    setBannerIconRef(null);
                }}
                title="Nueva categoría"
            >
                <form css={formStyles} onSubmit={submitCreate}>
                    {/* Banner upload */}
                    <div css={uploadAreaStyles} onClick={() => fileInputRef.current?.click()}>
                        {resolveIconSrc(bannerIconRef, iconSources) ? (
                            <img
                                src={resolveIconSrc(bannerIconRef, iconSources) ?? ""}
                                alt="banner"
                            />
                        ) : (
                            <>
                                <FiImage style={{ fontSize: 28 }} />
                                <span>Haz clic para añadir imagen de portada</span>
                            </>
                        )}
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={handleImagePick}
                    />
                    <Input
                        label="Nombre"
                        value={name}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setName(e.target.value)
                        }
                        autoFocus
                    />
                    <Input
                        label="Descripción"
                        value={desc}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setDesc(e.target.value)
                        }
                    />
                    <Button type="submit" full>
                        Crear
                    </Button>
                </form>
            </Modal>

            {/* ── Delete confirm modal ── */}
            <Modal
                open={!!pendingDelete}
                onClose={() => setPendingDelete(null)}
                title="Eliminar categoría"
            >
                <div css={confirmBodyStyles}>
                    <FiAlertTriangle css={confirmIconStyles} />
                    <p css={confirmTextStyles}>
                        ¿Seguro que quieres eliminar <b>{pendingDelete?.name}</b>?<br />
                        Se borrarán <b>todas las cuentas</b> que contiene. Esta acción no se puede
                        deshacer.
                    </p>
                    <div css={confirmActionsStyles}>
                        <Button variant="ghost" full onClick={() => setPendingDelete(null)}>
                            Cancelar
                        </Button>
                        <Button variant="danger" full disabled={deleting} onClick={confirmDelete}>
                            {deleting ? "Eliminando…" : "Sí, eliminar"}
                        </Button>
                    </div>
                </div>
            </Modal>
        </main>
    );
}

export default GroupsPage;
