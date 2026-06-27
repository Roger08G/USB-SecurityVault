/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    FiArrowLeft,
    FiPlus,
    FiSearch,
    FiCopy,
    FiTrash2,
    FiEdit2,
    FiRefreshCw,
    FiImage,
    FiEye,
    FiEyeOff,
} from "react-icons/fi";
import { RiLink } from "react-icons/ri";
import { api } from "@shared/api";
import type { EntryInput, EntryView, GroupSummary } from "@shared/types";
import { Button } from "@shared/components/Button";
import { Input } from "@shared/components/Input";
import { Modal } from "@shared/components/Modal";
import { theme } from "@shared/theme";
import { copyEphemeral } from "@shared/clipboard";
import {
    extractIconName,
    iconBytesToDataUrl,
    iconListToSources,
    isStoredImageIcon,
    normalizeIconForStorage,
    resolveIconSrc,
    toIconRef,
    type IconSources,
} from "@shared/iconAssets";

interface GroupTablePageProps {
    group: GroupSummary;
    onBack: () => void;
}

/* ── helpers ───────────────────────────────────────────────────────── */

const trunc = (s: string, n = 40) => (s.length > n ? s.slice(0, n) + "…" : s);

/* ── styles ────────────────────────────────────────────────────────── */

const pageStyles = css({
    position: "relative",
    zIndex: 1,
    width: "100vw",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
});

const headerStyles = css({
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: theme.space(4),
    padding: "28px 48px 0",
    boxSizing: "border-box",
    flexShrink: 0,
});

const titleStyles = css({ margin: 0, fontSize: 26, fontWeight: 700, color: theme.color.text });

const toolbarStyles = css({
    display: "flex",
    gap: theme.space(3),
    padding: "20px 48px 0",
    boxSizing: "border-box",
    flexShrink: 0,
});

const tableWrap = css({
    flex: 1,
    minHeight: 0,
    margin: "20px 48px 48px",
    background: theme.color.bgElevated,
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.radius.lg,
    overflowY: "auto",
    backdropFilter: "blur(18px)",
});

const tableStyles = css({
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "fixed",
    fontSize: 14,
    color: theme.color.text,
    "& th, & td": {
        textAlign: "left",
        padding: "10px 14px",
        borderBottom: `1px solid ${theme.color.border}`,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    "& th": {
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: theme.color.textMuted,
        background: "rgba(0,0,0,0.25)",
        position: "sticky",
        top: 0,
        zIndex: 1,
    },
    "& tr:last-child td": { borderBottom: "none" },
});

const rowStyles = css({
    position: "relative",
    "&:hover td": { background: "rgba(139,92,246,0.06)" },
    "& .row-actions": { opacity: 0, pointerEvents: "none", transition: "opacity 0.15s" },
    "&:hover .row-actions": { opacity: 1, pointerEvents: "auto" },
});

const logoCell = css({ width: "5%", padding: "8px 6px !important" });
const titleCol = css({ width: "15%" });
const userCol = css({ width: "30%" });
const pwdCol = css({ width: "15%" });
const urlCol = css({ width: "5%" });

const logoImgStyles = css({
    width: 28,
    height: 28,
    borderRadius: 8,
    objectFit: "cover",
    display: "block",
    flexShrink: 0,
});

const logoPlaceholder = css({
    width: 28,
    height: 28,
    borderRadius: 8,
    background: `linear-gradient(135deg, ${theme.color.accentDeep}, ${theme.color.bgSpace})`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
    color: theme.color.accentGlow,
    flexShrink: 0,
});

const monoCell = css({ fontFamily: theme.font.mono, color: theme.color.accentGlow });

const rowActionsStyles = css({
    position: "absolute",
    right: 14,
    top: "50%",
    transform: "translateY(-50%)",
    display: "flex",
    gap: 4,
    background: theme.color.bgElevated,
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.radius.md,
    padding: "2px 4px",
    boxShadow: theme.shadow.card,
});

const emptyStyles = css({
    padding: theme.space(10),
    textAlign: "center",
    color: theme.color.textMuted,
});

/* ── form styles ───────────────────────────────────────────────────── */

const formStyles = css({
    display: "flex",
    flexDirection: "column",
    gap: theme.space(3),
    overflow: "hidden",
});

const iconPickerStyles = css({
    display: "flex",
    flexDirection: "column",
    gap: 8,
});

const iconGridStyles = css({
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    maxHeight: 120,
    overflowY: "auto",
    padding: 4,
});

const iconThumbStyles = (selected: boolean) =>
    css({
        width: 40,
        height: 40,
        borderRadius: 8,
        objectFit: "contain",
        cursor: "pointer",
        border: `2px solid ${selected ? theme.color.accent : "transparent"}`,
        background: "rgba(255,255,255,0.05)",
        transition: "border-color 0.15s",
        "&:hover": { borderColor: theme.color.accentGlow },
    });

const uploadAreaStyles = css({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    border: `1px dashed ${theme.color.border}`,
    borderRadius: theme.radius.md,
    cursor: "pointer",
    color: theme.color.textMuted,
    fontSize: 13,
    transition: `border-color ${theme.transition.base}`,
    "&:hover": { borderColor: theme.color.accent },
});

/* ── empty entry ───────────────────────────────────────────────────── */

const emptyEntry: EntryInput = {
    title: "",
    username: "",
    password: "",
    url: "",
    notes: "",
    tags: [],
    icon: null,
};

/* ── component ─────────────────────────────────────────────────────── */

export function GroupTablePage({ group, onBack }: GroupTablePageProps) {
    const [entries, setEntries] = useState<EntryView[]>([]);
    const [query, setQuery] = useState("");
    const [editing, setEditing] = useState<EntryView | null>(null);
    const [creating, setCreating] = useState(false);
    const [draft, setDraft] = useState<EntryInput>(emptyEntry);
    const [pendingDelete, setPendingDelete] = useState<EntryView | null>(null);
    const [iconSources, setIconSources] = useState<IconSources>({});

    const refresh = () => api.listEntries(group.id).then(setEntries);
    useEffect(() => {
        void refresh();
    }, [group.id]); // eslint-disable-line

    useEffect(() => {
        api.listIcons()
            .then((icons) => setIconSources(iconListToSources(icons)))
            .catch(() => setIconSources({}));
    }, []);

    const handleIconSaved = (name: string, src: string) => {
        setIconSources((current) => ({ ...current, [name]: src }));
    };

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return entries;
        return entries.filter((e) =>
            [e.title, e.username, e.url, e.notes, ...e.tags].some((s) =>
                s.toLowerCase().includes(q),
            ),
        );
    }, [entries, query]);

    const openCreate = () => {
        setDraft(emptyEntry);
        setCreating(true);
    };
    const openEdit = (e: EntryView) => {
        setEditing(e);
        setDraft({
            title: e.title,
            username: e.username,
            password: "",
            url: e.url,
            notes: e.notes,
            tags: e.tags,
            icon: e.icon,
        });
    };

    const normalizeDraft = (input: EntryInput): EntryInput => ({
        ...input,
        icon: normalizeIconForStorage(input.icon),
    });

    const submitCreate = async (ev: React.FormEvent, input: EntryInput) => {
        ev.preventDefault();
        await api.createEntry(group.id, normalizeDraft(input));
        setCreating(false);
        await refresh();
    };

    const submitEdit = async (ev: React.FormEvent, input: EntryInput) => {
        ev.preventDefault();
        if (!editing) return;
        await api.updateEntry(group.id, editing.id, normalizeDraft(input));
        setEditing(null);
        await refresh();
    };

    const confirmDelete = async () => {
        if (!pendingDelete) return;
        await api.deleteEntry(group.id, pendingDelete.id);
        setPendingDelete(null);
        await refresh();
    };

    const copyPwd = async (e: EntryView) => {
        const pwd = await api.revealPassword(group.id, e.id);
        copyEphemeral(pwd, 10_000);
    };

    const generate = async () => {
        const pwd = await api.generatePassword(50, true);
        setDraft((d: EntryInput) => ({ ...d, password: pwd }));
    };

    return (
        <main css={pageStyles}>
            <header css={headerStyles}>
                <div css={{ display: "flex", alignItems: "center", gap: theme.space(3) }}>
                    <Button variant="ghost" size="sm" leftIcon={<FiArrowLeft />} onClick={onBack}>
                        Volver
                    </Button>
                    <h1 css={titleStyles}>{group.name}</h1>
                </div>
                <div css={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Button leftIcon={<FiPlus />} onClick={openCreate}>
                        Nueva cuenta
                    </Button>
                </div>
            </header>

            <div css={toolbarStyles}>
                <Input
                    leftIcon={<FiSearch />}
                    placeholder="Buscar por título, usuario, URL, etiqueta…"
                    value={query}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                />
            </div>

            <div css={tableWrap}>
                <table css={tableStyles}>
                    <colgroup>
                        <col style={{ width: "5%" }} />
                        <col style={{ width: "15%" }} />
                        <col style={{ width: "40%" }} />
                        <col style={{ width: "15%" }} />
                        <col style={{ width: "5%" }} />
                        <col style={{ width: "20%" }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th css={logoCell}>#</th>
                            <th css={titleCol}>Título</th>
                            <th css={userCol}>Usuario</th>
                            <th css={pwdCol}>Contraseña</th>
                            <th css={urlCol}>URL</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((e) => (
                            <tr key={e.id} css={rowStyles}>
                                <td css={logoCell}>
                                    {resolveIconSrc(e.icon, iconSources) ? (
                                        <img
                                            src={resolveIconSrc(e.icon, iconSources) ?? ""}
                                            alt=""
                                            css={logoImgStyles}
                                        />
                                    ) : (
                                        <div css={logoPlaceholder}>
                                            {e.title[0]?.toUpperCase() ?? "?"}
                                        </div>
                                    )}
                                </td>
                                <td css={titleCol}>
                                    <span css={{ fontWeight: 600, color: theme.color.text }}>
                                        {trunc(e.title, 22)}
                                    </span>
                                </td>
                                <td
                                    css={userCol}
                                    onDoubleClick={() => copyEphemeral(e.username, 10_000)}
                                    title="Doble clic para copiar"
                                >
                                    <span css={[monoCell, { fontSize: 13, cursor: "copy" }]}>
                                        {trunc(e.username, 40)}
                                    </span>
                                </td>
                                <td
                                    css={pwdCol}
                                    onDoubleClick={() => copyPwd(e)}
                                    title="Doble clic para copiar"
                                >
                                    <span
                                        css={[
                                            monoCell,
                                            { fontSize: 11, opacity: 0.7, cursor: "copy" },
                                        ]}
                                    >
                                        {"••••••••••"}
                                    </span>
                                </td>
                                <td
                                    css={[urlCol, { textAlign: "center" }]}
                                    onClick={(ev) => ev.stopPropagation()}
                                >
                                    {e.url ? (
                                        <button
                                            type="button"
                                            onClick={() => copyEphemeral(e.url, 10_000)}
                                            title={`Copiar enlace: ${e.url}`}
                                            css={{
                                                background: "transparent",
                                                border: "none",
                                                cursor: "pointer",
                                                color: "#7dd3fc",
                                                display: "inline-flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                padding: 4,
                                                fontSize: 18,
                                                transition: "color 0.15s, transform 0.15s",
                                                "&:hover": {
                                                    color: "#bae6fd",
                                                    transform: "scale(1.15)",
                                                },
                                            }}
                                        >
                                            <RiLink />
                                        </button>
                                    ) : (
                                        <span css={{ color: theme.color.textMuted, fontSize: 12 }}>
                                            —
                                        </span>
                                    )}
                                </td>
                                <td css={[{ position: "relative" }]}>
                                    {/* Floating action bar on hover */}
                                    <div
                                        className="row-actions"
                                        css={rowActionsStyles}
                                        onClick={(ev) => ev.stopPropagation()}
                                    >
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => copyPwd(e)}
                                            leftIcon={<FiCopy />}
                                            title="Copiar contraseña"
                                        />
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => openEdit(e)}
                                            leftIcon={<FiEdit2 />}
                                            title="Editar"
                                        />
                                        <Button
                                            size="sm"
                                            variant="danger"
                                            onClick={() => setPendingDelete(e)}
                                            leftIcon={<FiTrash2 />}
                                            title="Eliminar"
                                        />
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={6}>
                                    <div css={emptyStyles}>
                                        Sin cuentas. Pulsa <b>Nueva cuenta</b> para empezar.
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Create modal */}
            <Modal
                open={creating}
                onClose={() => setCreating(false)}
                title="Nueva cuenta"
                width={540}
            >
                <EntryForm
                    draft={draft}
                    iconSources={iconSources}
                    onIconSaved={handleIconSaved}
                    setDraft={setDraft}
                    onSubmit={submitCreate}
                    onGenerate={generate}
                    submitLabel="Crear"
                />
            </Modal>

            {/* Edit modal */}
            <Modal
                open={!!editing}
                onClose={() => setEditing(null)}
                title="Editar cuenta"
                width={540}
            >
                <EntryForm
                    draft={draft}
                    iconSources={iconSources}
                    onIconSaved={handleIconSaved}
                    setDraft={setDraft}
                    onSubmit={submitEdit}
                    onGenerate={generate}
                    submitLabel="Guardar"
                />
            </Modal>

            {/* Delete confirm */}
            <Modal
                open={!!pendingDelete}
                onClose={() => setPendingDelete(null)}
                title="Eliminar cuenta"
            >
                <div
                    css={{
                        display: "flex",
                        flexDirection: "column",
                        gap: theme.space(4),
                        textAlign: "center",
                    }}
                >
                    <p css={{ color: theme.color.textMuted, fontSize: 14 }}>
                        ¿Eliminar <b css={{ color: theme.color.text }}>{pendingDelete?.title}</b>?
                        Esta acción no se puede deshacer.
                    </p>
                    <div css={{ display: "flex", gap: theme.space(3) }}>
                        <Button variant="ghost" full onClick={() => setPendingDelete(null)}>
                            Cancelar
                        </Button>
                        <Button variant="danger" full onClick={confirmDelete}>
                            Eliminar
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* viewer reverted */}
        </main>
    );
}

/* ── EntryForm ─────────────────────────────────────────────────────── */

interface EntryFormProps {
    draft: EntryInput;
    iconSources: IconSources;
    onIconSaved: (name: string, src: string) => void;
    setDraft: (updater: (prev: EntryInput) => EntryInput) => void;
    onSubmit: (e: React.FormEvent, input: EntryInput) => void;
    onGenerate: () => void;
    submitLabel: string;
}

function EntryForm({
    draft,
    iconSources,
    onIconSaved,
    setDraft,
    onSubmit,
    onGenerate,
    submitLabel,
}: EntryFormProps) {
    const [tagsText, setTagsText] = useState(draft.tags.join(", "));
    const [showPwd, setShowPwd] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const uploadedIcons = useMemo(
        () =>
            Object.entries(iconSources).map(([name, src]) => ({
                name,
                src,
                ref: toIconRef(name),
            })),
        [iconSources],
    );

    useEffect(() => {
        setTagsText(draft.tags.join(", "));
    }, [draft.tags]);

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const arrayBuf = await file.arrayBuffer();
        const bytes = Array.from(new Uint8Array(arrayBuf));
        const safeName = await api.saveIcon(file.name, bytes);
        const icon = await api.readIcon(safeName);
        const iconRef = toIconRef(safeName);
        const iconSrc = iconBytesToDataUrl(icon);
        onIconSaved(safeName, iconSrc);
        setDraft((d: EntryInput) => ({ ...d, icon: iconRef }));
    };

    const previewSrc = resolveIconSrc(draft.icon, iconSources);

    return (
        <form
            css={formStyles}
            onSubmit={(e) => {
                const input = {
                    ...draft,
                    tags: tagsText
                        .split(",")
                        .map((t: string) => t.trim())
                        .filter(Boolean),
                    icon: normalizeIconForStorage(draft.icon),
                };
                setDraft(() => input);
                onSubmit(e, input);
            }}
        >
            {/* Logo picker */}
            <div css={iconPickerStyles}>
                <label
                    css={{
                        fontSize: 12,
                        color: theme.color.textMuted,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                    }}
                >
                    Logo
                </label>
                {/* Current selection preview */}
                <div css={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {draft.icon ? (
                        isStoredImageIcon(draft.icon) && previewSrc ? (
                            <img
                                src={previewSrc}
                                css={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: 8,
                                    objectFit: "contain",
                                    background: "rgba(255,255,255,0.05)",
                                }}
                                alt="logo"
                            />
                        ) : (
                            <div
                                css={[
                                    logoPlaceholder,
                                    {
                                        width: 40,
                                        height: 40,
                                        fontSize: 20,
                                        borderRadius: 8,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                    },
                                ]}
                            >
                                {draft.icon}
                            </div>
                        )
                    ) : (
                        <div
                            css={[
                                logoPlaceholder,
                                { width: 40, height: 40, fontSize: 18, borderRadius: 8 },
                            ]}
                        >
                            <FiImage />
                        </div>
                    )}

                    {/* (Emoji picker removed) */}
                    <div css={uploadAreaStyles} onClick={() => fileRef.current?.click()}>
                        <FiImage />
                        <span>Subir imagen o .ico</span>
                    </div>
                    <input
                        ref={fileRef}
                        type="file"
                        accept="image/*,.ico"
                        style={{ display: "none" }}
                        onChange={handleFile}
                    />
                </div>
                {/* Previously uploaded */}
                {uploadedIcons.length > 0 && (
                    <div css={iconGridStyles}>
                        {uploadedIcons.map((u) => (
                            <img
                                key={u.name}
                                src={u.src}
                                alt={u.name}
                                title={u.name}
                                css={iconThumbStyles(
                                    draft.icon === u.ref || extractIconName(draft.icon) === u.name,
                                )}
                                onClick={() => setDraft((d: EntryInput) => ({ ...d, icon: u.ref }))}
                            />
                        ))}
                    </div>
                )}
            </div>

            <Input
                label="Título"
                value={draft.title}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setDraft((d: EntryInput) => ({ ...d, title: e.target.value }))
                }
                autoFocus
                required
            />
            <Input
                label="Usuario / Email"
                value={draft.username}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setDraft((d: EntryInput) => ({ ...d, username: e.target.value }))
                }
                monospace
            />
            <Input
                label="Contraseña"
                type={showPwd ? "text" : "password"}
                value={draft.password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setDraft((d: EntryInput) => ({ ...d, password: e.target.value }))
                }
                monospace
                rightSlot={
                    <>
                        <button
                            type="button"
                            onClick={() => setShowPwd((v) => !v)}
                            css={{
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                                color: theme.color.textMuted,
                                padding: "0 8px",
                                display: "flex",
                                alignItems: "center",
                                "&:hover": { color: theme.color.text },
                            }}
                            title={showPwd ? "Ocultar" : "Mostrar"}
                        >
                            {showPwd ? <FiEyeOff /> : <FiEye />}
                        </button>
                        <button
                            type="button"
                            onClick={onGenerate}
                            css={{
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                                color: theme.color.accent,
                                padding: "0 12px",
                                display: "flex",
                                alignItems: "center",
                            }}
                            title="Generar contraseña de 50 caracteres"
                        >
                            <FiRefreshCw />
                        </button>
                    </>
                }
            />
            <Input
                label="URL"
                value={draft.url}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setDraft((d: EntryInput) => ({ ...d, url: e.target.value }))
                }
            />
            <Input
                label="Etiquetas (separadas por coma)"
                value={tagsText}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTagsText(e.target.value)}
            />
            <Input
                label="Notas"
                value={draft.notes}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setDraft((d: EntryInput) => ({ ...d, notes: e.target.value }))
                }
            />
            <Button type="submit" full>
                {submitLabel}
            </Button>
        </form>
    );
}

export default GroupTablePage;
