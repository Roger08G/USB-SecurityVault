/** @jsxImportSource @emotion/react */
import { css } from '@emotion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
	FiArrowLeft, FiPlus, FiSearch, FiCopy,
	FiTrash2, FiEdit2, FiRefreshCw, FiImage, FiEye, FiEyeOff,
} from 'react-icons/fi';
import { RiLink } from 'react-icons/ri';
import { api } from '@shared/api';
import type { EntryInput, EntryView, GroupSummary } from '@shared/types';
import { Button } from '@shared/components/Button';
import { Input } from '@shared/components/Input';
import { Modal } from '@shared/components/Modal';
import { theme } from '@shared/theme';
import { copyEphemeral } from '@shared/clipboard';

interface GroupTablePageProps {
	group: GroupSummary;
	onBack: () => void;
}

/* ── helpers ───────────────────────────────────────────────────────── */

const trunc = (s: string, n = 40) => s.length > n ? s.slice(0, n) + '…' : s;

/* ── styles ────────────────────────────────────────────────────────── */

const pageStyles = css({
	position: 'relative', zIndex: 1,
	width: '100vw', height: '100vh',
	display: 'flex', flexDirection: 'column',
	overflow: 'hidden',
});

const headerStyles = css({
	width: '100%', display: 'flex',
	justifyContent: 'space-between', alignItems: 'center',
	gap: theme.space(4),
	padding: '28px 48px 0', boxSizing: 'border-box', flexShrink: 0,
});

const titleStyles = css({ margin: 0, fontSize: 26, fontWeight: 700, color: theme.color.text });

const toolbarStyles = css({
	display: 'flex', gap: theme.space(3),
	padding: '20px 48px 0', boxSizing: 'border-box', flexShrink: 0,
});

const tableWrap = css({
	flex: 1, minHeight: 0,
	margin: '20px 48px 48px',
	background: theme.color.bgElevated,
	border: `1px solid ${theme.color.border}`,
	borderRadius: theme.radius.lg,
	overflowY: 'auto',
	backdropFilter: 'blur(18px)',
});

const tableStyles = css({
	width: '100%',
	borderCollapse: 'collapse',
	tableLayout: 'fixed',
	fontSize: 14,
	color: theme.color.text,
	'& th, & td': {
		textAlign: 'left',
		padding: '10px 14px',
		borderBottom: `1px solid ${theme.color.border}`,
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
	},
	'& th': {
		fontSize: 11,
		textTransform: 'uppercase',
		letterSpacing: '0.08em',
		color: theme.color.textMuted,
		background: 'rgba(0,0,0,0.25)',
		position: 'sticky',
		top: 0,
		zIndex: 1,
	},
	'& tr:last-child td': { borderBottom: 'none' },
});

const rowStyles = css({
	position: 'relative',
	'&:hover td': { background: 'rgba(139,92,246,0.06)' },
	'& .row-actions': { opacity: 0, pointerEvents: 'none', transition: 'opacity 0.15s' },
	'&:hover .row-actions': { opacity: 1, pointerEvents: 'auto' },
});

const logoCell = css({ width: '5%', padding: '8px 6px !important' });
const titleCol = css({ width: '15%' });
const userCol = css({ width: '30%' });
const pwdCol = css({ width: '15%' });
const urlCol = css({ width: '5%' });

const logoImgStyles = css({
	width: 28, height: 28,
	borderRadius: 8,
	objectFit: 'cover',
	display: 'block',
	flexShrink: 0,
});

const logoPlaceholder = css({
	width: 28, height: 28,
	borderRadius: 8,
	background: `linear-gradient(135deg, ${theme.color.accentDeep}, ${theme.color.bgSpace})`,
	display: 'flex', alignItems: 'center', justifyContent: 'center',
	fontSize: 16, color: theme.color.accentGlow,
	flexShrink: 0,
});

const monoCell = css({ fontFamily: theme.font.mono, color: theme.color.accentGlow });

const rowActionsStyles = css({
	position: 'absolute',
	right: 14,
	top: '50%',
	transform: 'translateY(-50%)',
	display: 'flex',
	gap: 4,
	background: theme.color.bgElevated,
	border: `1px solid ${theme.color.border}`,
	borderRadius: theme.radius.md,
	padding: '2px 4px',
	boxShadow: theme.shadow.card,
});

const emptyStyles = css({
	padding: theme.space(10),
	textAlign: 'center',
	color: theme.color.textMuted,
});

/* ── form styles ───────────────────────────────────────────────────── */

const formStyles = css({ display: 'flex', flexDirection: 'column', gap: theme.space(3), overflow: 'hidden' });

const iconPickerStyles = css({
	display: 'flex', flexDirection: 'column', gap: 8,
});

const iconGridStyles = css({
	display: 'flex', flexWrap: 'wrap', gap: 8,
	maxHeight: 120, overflowY: 'auto',
	padding: 4,
});

const iconThumbStyles = (selected: boolean) => css({
	width: 40, height: 40,
	borderRadius: 8,
	objectFit: 'contain',
	cursor: 'pointer',
	border: `2px solid ${selected ? theme.color.accent : 'transparent'}`,
	background: 'rgba(255,255,255,0.05)',
	transition: 'border-color 0.15s',
	'&:hover': { borderColor: theme.color.accentGlow },
});

const uploadAreaStyles = css({
	display: 'flex', alignItems: 'center', gap: 8,
	padding: '8px 12px',
	border: `1px dashed ${theme.color.border}`,
	borderRadius: theme.radius.md,
	cursor: 'pointer',
	color: theme.color.textMuted, fontSize: 13,
	transition: `border-color ${theme.transition.base}`,
	'&:hover': { borderColor: theme.color.accent },
});

/* ── empty entry ───────────────────────────────────────────────────── */

const emptyEntry: EntryInput = {
	title: '', username: '', password: '', url: '', notes: '', tags: [], icon: null
};

/* ── component ─────────────────────────────────────────────────────── */

export function GroupTablePage({ group, onBack }: GroupTablePageProps) {
	const [entries, setEntries] = useState<EntryView[]>([]);
	const [query, setQuery] = useState('');
	const [editing, setEditing] = useState<EntryView | null>(null);
	const [creating, setCreating] = useState(false);
	const [draft, setDraft] = useState<EntryInput>(emptyEntry);
	const [pendingDelete, setPendingDelete] = useState<EntryView | null>(null);
	const [viewMode, setViewMode] = useState<'passwords' | 'env'>('passwords');

	const refresh = () => api.listEntries(group.id).then(setEntries);
	useEffect(() => { void refresh(); }, [group.id]); // eslint-disable-line

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return entries;
		return entries.filter((e) =>
			[e.title, e.username, e.url, e.notes, ...e.tags].some((s) => s.toLowerCase().includes(q))
		);
	}, [entries, query]);

	// Entries displayed in the current view. Env-tagged entries are hidden from the passwords table.
	const displayed = useMemo(() => {
		if (viewMode === 'env') return filtered.filter((e) => e.tags.includes('env'));
		return filtered.filter((e) => !e.tags.includes('env'));
	}, [filtered, viewMode]);

	const openCreate = () => { setDraft(emptyEntry); setCreating(true); };
	const openEdit = (e: EntryView) => {
		setEditing(e);
		setDraft({ title: e.title, username: e.username, password: '', url: e.url, notes: e.notes, tags: e.tags, icon: e.icon });
	};

	const submitCreate = async (ev: React.FormEvent) => {
		ev.preventDefault();
		await api.createEntry(group.id, draft);
		setCreating(false);
		await refresh();
	};

	const submitEdit = async (ev: React.FormEvent) => {
		ev.preventDefault();
		if (!editing) return;
		await api.updateEntry(group.id, editing.id, draft);
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

	// no-op viewer for env (reverted)

	const generate = async () => {
		const pwd = await api.generatePassword(50, true);
		setDraft((d: EntryInput) => ({ ...d, password: pwd }));
	};

	// Env editor state
	const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null);
	const [envText, setEnvText] = useState<string>('');

	useEffect(() => {
		if (viewMode === 'env') {
			// If there are no env entries, create a default one so the editor is always available.
			const ensureDefault = async () => {
				if (displayed.length === 0) {
					const input: EntryInput = { ...emptyEntry, title: 'Archivo', notes: '', tags: ['env'] };
					const created = await api.createEntry(group.id, input);
					await refresh();
					setSelectedEnvId(created.id);
					setEnvText(created.notes || '');
					return;
				}
				// otherwise select first
				const first = displayed[0];
				if (first) {
					setSelectedEnvId(first.id);
					setEnvText(first.notes || '');
				}
			};
			void ensureDefault();
		}
	}, [viewMode, displayed]);

	useEffect(() => {
		if (selectedEnvId) {
			const e = displayed.find((it) => it.id === selectedEnvId);
			if (e) setEnvText(e.notes || '');
		}
	}, [selectedEnvId, displayed]);

	const saveEnvEdits = async () => {
		if (!selectedEnvId) return;
		const e = displayed.find((it) => it.id === selectedEnvId);
		if (!e) return;
		// Build EntryInput preserving password by sending empty string (backend won't overwrite)
		const input: EntryInput = {
			title: e.title,
			username: e.username,
			password: '',
			url: e.url,
			notes: envText,
			tags: e.tags,
			icon: e.icon,
		};
		await api.updateEntry(group.id, e.id, input);
		await refresh();
		// keep selection
	};

	// Syntax highlighter for the env editor: paint '=' and comment lines starting with '#'
	const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

	const highlightEnv = (text: string) => {
		if (!text) return '';
		const lines = text.split('\n');
		return lines.map((ln) => {
			if (ln.trimStart().startsWith('#')) {
				return `<span class="env-comment">${escapeHtml(ln)}</span>`;
			}
			// highlight equals signs
			return escapeHtml(ln).replace(/=/g, '<span class="env-eq">=</span>');
		}).join('\n');
	};

	return (
		<main css={pageStyles}>
			<header css={headerStyles}>
				<div css={{ display: 'flex', alignItems: 'center', gap: theme.space(3) }}>
					<Button variant="ghost" size="sm" leftIcon={<FiArrowLeft />} onClick={onBack}>Volver</Button>
					<h1 css={titleStyles}>{group.name}</h1>
				</div>
				<div css={{ display: 'flex', alignItems: 'center', gap: 12 }}>
					<div css={{ display: 'flex', gap: 8 }}>
						<button type="button" css={{ padding: '6px 10px', borderRadius: 8, border: viewMode === 'passwords' ? `1px solid ${theme.color.accent}` : `1px solid ${theme.color.border}`, background: viewMode === 'passwords' ? theme.color.bgElevated : 'transparent', color: theme.color.text }} onClick={() => setViewMode('passwords')}>Contraseñas</button>
						<button type="button" css={{ padding: '6px 10px', borderRadius: 8, border: viewMode === 'env' ? `1px solid ${theme.color.accent}` : `1px solid ${theme.color.border}`, background: viewMode === 'env' ? theme.color.bgElevated : 'transparent', color: theme.color.text }} onClick={() => setViewMode('env')}>Variables</button>
					</div>
					<Button leftIcon={<FiPlus />} onClick={openCreate}>Nueva cuenta</Button>
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
				{viewMode === 'env' ? (
					<div css={{ padding: 24, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
						{selectedEnvId ? (
							<>
								{/* Highlighted overlay + transparent textarea for editing */}
								<div css={{ position: 'relative', flex: 1, minHeight: 0 }}>
									<pre
										aria-hidden
										css={{
											margin: 0,
											padding: 12,
											borderRadius: theme.radius.md,
											border: `1px solid ${theme.color.border}`,
											background: theme.color.bgElevated,
											color: theme.color.text,
											fontFamily: theme.font.mono,
											fontSize: 13,
											whiteSpace: 'pre-wrap',
											wordBreak: 'break-word',
											flex: 1,
											overflow: 'auto',
											minHeight: 0,
											pointerEvents: 'none',
											lineHeight: 1.45,
											'& .env-eq': { color: '#ff6b9b', fontWeight: 600 },
											'& .env-comment': { color: '#9aa0a6' },
										}}
										dangerouslySetInnerHTML={{ __html: highlightEnv(envText) }}
									/>
									<textarea
										value={envText}
										onChange={(e) => setEnvText(e.target.value)}
										css={{
											position: 'absolute',
											top: 0, left: 0, right: 0, bottom: 0,
											width: '100%', height: '100%',
											padding: 12,
											borderRadius: theme.radius.md,
											border: 'none',
											background: 'transparent',
											color: 'transparent',
											caretColor: theme.color.text,
											resize: 'none',
											outline: 'none',
											fontFamily: theme.font.mono,
											fontSize: 13,
											lineHeight: 1.45,
										}}
									/>
								</div>
								<div css={{ display: 'flex', gap: theme.space(3), marginTop: 8 }}>
									<Button onClick={saveEnvEdits}>Guardar</Button>
									<Button variant="ghost" onClick={() => { const e = displayed.find((it) => it.id === selectedEnvId); if (e) setEnvText(e.notes || ''); }}>Revertir</Button>
								</div>
							</>
						) : (
							<div css={emptyStyles}></div>
						)}
					</div>
				) : (
					<table css={tableStyles}>
						<colgroup>
							<col style={{ width: '5%' }} />
							<col style={{ width: '15%' }} />
							<col style={{ width: '40%' }} />
							<col style={{ width: '15%' }} />
							<col style={{ width: '5%' }} />
							<col style={{ width: '20%' }} />
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
							{displayed.map((e) => (
								<tr key={e.id} css={rowStyles}>
									<td css={logoCell}>
										{e.icon
											? <img src={e.icon} alt="" css={logoImgStyles} />
											: <div css={logoPlaceholder}>{e.title[0]?.toUpperCase() ?? '?'}</div>
										}
									</td>
									<td css={titleCol}>
										<span css={{ fontWeight: 600, color: theme.color.text }}>{trunc(e.title, 22)}</span>
									</td>
									<td css={userCol} onDoubleClick={() => copyEphemeral(e.username, 10_000)} title="Doble clic para copiar">
										<span css={[monoCell, { fontSize: 13, cursor: 'copy' }]}>{trunc(e.username, 40)}</span>
									</td>
									<td css={pwdCol} onDoubleClick={() => copyPwd(e)} title="Doble clic para copiar">
										<span css={[monoCell, { fontSize: 11, opacity: 0.7, cursor: 'copy' }]}>
											{'••••••••••'}
										</span>
									</td>
									<td css={[urlCol, { textAlign: 'center' }]} onClick={(ev) => ev.stopPropagation()}>
										{e.url
											? (
												<button
													type="button"
													onClick={() => copyEphemeral(e.url, 10_000)}
													title={`Copiar enlace: ${e.url}`}
													css={{
														background: 'transparent',
														border: 'none',
														cursor: 'pointer',
														color: '#7dd3fc',
														display: 'inline-flex',
														alignItems: 'center',
														justifyContent: 'center',
														padding: 4,
														fontSize: 18,
														transition: 'color 0.15s, transform 0.15s',
														'&:hover': { color: '#bae6fd', transform: 'scale(1.15)' },
													}}
												>
													<RiLink />
												</button>
											)
											: <span css={{ color: theme.color.textMuted, fontSize: 12 }}>—</span>
										}
									</td>
									<td css={[{ position: 'relative' }]}>
										{/* Floating action bar on hover */}
										<div className="row-actions" css={rowActionsStyles} onClick={(ev) => ev.stopPropagation()}>
											<Button size="sm" variant="ghost" onClick={() => copyPwd(e)} leftIcon={<FiCopy />} title="Copiar contraseña" />
											<Button size="sm" variant="ghost" onClick={() => openEdit(e)} leftIcon={<FiEdit2 />} title="Editar" />
											<Button size="sm" variant="danger" onClick={() => setPendingDelete(e)} leftIcon={<FiTrash2 />} title="Eliminar" />
										</div>
									</td>
								</tr>
							))}
							{filtered.length === 0 && (
								<tr>
									<td colSpan={5}>
										<div css={emptyStyles}>
											Sin cuentas. Pulsa <b>Nueva cuenta</b> para empezar.
										</div>
									</td>
								</tr>
							)}
						</tbody>
					</table>
				)}
			</div>

			{/* Create modal */}
			<Modal open={creating} onClose={() => setCreating(false)} title="Nueva cuenta" width={540}>
				<EntryForm draft={draft} setDraft={setDraft} onSubmit={submitCreate} onGenerate={generate} submitLabel="Crear" />
			</Modal>

			{/* Edit modal */}
			<Modal open={!!editing} onClose={() => setEditing(null)} title="Editar cuenta" width={540}>
				<EntryForm draft={draft} setDraft={setDraft} onSubmit={submitEdit} onGenerate={generate} submitLabel="Guardar" />
			</Modal>

			{/* Delete confirm */}
			<Modal open={!!pendingDelete} onClose={() => setPendingDelete(null)} title="Eliminar cuenta">
				<div css={{ display: 'flex', flexDirection: 'column', gap: theme.space(4), textAlign: 'center' }}>
					<p css={{ color: theme.color.textMuted, fontSize: 14 }}>
						¿Eliminar <b css={{ color: theme.color.text }}>{pendingDelete?.title}</b>? Esta acción no se puede deshacer.
					</p>
					<div css={{ display: 'flex', gap: theme.space(3) }}>
						<Button variant="ghost" full onClick={() => setPendingDelete(null)}>Cancelar</Button>
						<Button variant="danger" full onClick={confirmDelete}>Eliminar</Button>
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
	setDraft: (updater: (prev: EntryInput) => EntryInput) => void;
	onSubmit: (e: React.FormEvent) => void;
	onGenerate: () => void;
	submitLabel: string;
}

function EntryForm({ draft, setDraft, onSubmit, onGenerate, submitLabel }: EntryFormProps) {
	const [tagsText, setTagsText] = useState(draft.tags.join(', '));
	const [uploads, setUploads] = useState<{ name: string; dataUrl: string }[]>([]);
	const [showPwd, setShowPwd] = useState(false);
	const fileRef = useRef<HTMLInputElement>(null);

	useEffect(() => { setTagsText(draft.tags.join(', ')); }, [draft.tags]);

    

	// Load previously uploaded icons
	useEffect(() => {
		api.listUploads()
			.then((items: { name: string; path: string }[]) => setUploads(
				items.map((it) => ({
					name: it.name,
					dataUrl: convertFileSrc(it.path),
				}))
			))
			.catch(() => {/* uploads dir may not exist yet */ });
	}, []);

	const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		const arrayBuf = await file.arrayBuffer();
		const bytes = Array.from(new Uint8Array(arrayBuf));
		// Save to uploads folder and get the safe filename back
		const safeName = await api.saveUpload(file.name, bytes);
		// Get uploads dir to build the asset URL
		const uploadsDir = await api.getUploadsDir();
		const filePath = `${uploadsDir}/${safeName}`;
		const assetUrl = convertFileSrc(filePath);
		// Store the asset URL directly (no heavy base64 in vault)
		setDraft((d: EntryInput) => ({ ...d, icon: assetUrl }));
		setUploads((prev) => {
			const exists = prev.some((u) => u.name === safeName);
			return exists ? prev : [...prev, { name: safeName, dataUrl: assetUrl }];
		});
	};



	return (
		<form css={formStyles} onSubmit={(e) => {
			setDraft((d: EntryInput) => ({ ...d, tags: tagsText.split(',').map((t: string) => t.trim()).filter(Boolean) }));
			onSubmit(e);
		}}>
			{/* Logo picker */}
			<div css={iconPickerStyles}>
				<label css={{ fontSize: 12, color: theme.color.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
					Logo
				</label>
				{/* Current selection preview */}
				<div css={{ display: 'flex', alignItems: 'center', gap: 12 }}>
					{draft.icon
						? (
							// If icon looks like a URL/data, render an image; otherwise assume emoji character
							(draft.icon.startsWith('data:') || draft.icon.includes('://'))
								? <img src={draft.icon} css={{ width: 40, height: 40, borderRadius: 8, objectFit: 'contain', background: 'rgba(255,255,255,0.05)' }} alt="logo" />
								: <div css={[logoPlaceholder, { width: 40, height: 40, fontSize: 20, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }]}>{draft.icon}</div>
						) : (
							<div css={[logoPlaceholder, { width: 40, height: 40, fontSize: 18, borderRadius: 8 }]}><FiImage /></div>
						)
					}

					{/* (Emoji picker removed) */}
					<div
						css={uploadAreaStyles}
						onClick={() => fileRef.current?.click()}
					>
						<FiImage />
						<span>Subir imagen o .ico</span>
					</div>
					<input ref={fileRef} type="file" accept="image/*,.ico" style={{ display: 'none' }} onChange={handleFile} />
				</div>
				{/* Previously uploaded */}
				{uploads.length > 0 && (
					<div css={iconGridStyles}>
						{uploads.map((u) => (
							<img
								key={u.name}
								src={u.dataUrl}
								alt={u.name}
								title={u.name}
								css={iconThumbStyles(draft.icon === u.dataUrl)}
								onClick={() => setDraft((d: EntryInput) => ({ ...d, icon: u.dataUrl }))}
							/>
						))}
					</div>
				)}
			</div>

			<Input label="Título" value={draft.title} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft((d: EntryInput) => ({ ...d, title: e.target.value }))} autoFocus required />
			<Input label="Usuario / Email" value={draft.username} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft((d: EntryInput) => ({ ...d, username: e.target.value }))} monospace />
			<Input
				label="Contraseña"
				type={showPwd ? 'text' : 'password'}
				value={draft.password}
				onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft((d: EntryInput) => ({ ...d, password: e.target.value }))}
				monospace
				rightSlot={
					<>
						<button
							type="button"
							onClick={() => setShowPwd((v) => !v)}
							css={{ background: 'transparent', border: 'none', cursor: 'pointer', color: theme.color.textMuted, padding: '0 8px', display: 'flex', alignItems: 'center', '&:hover': { color: theme.color.text } }}
							title={showPwd ? 'Ocultar' : 'Mostrar'}
						>
							{showPwd ? <FiEyeOff /> : <FiEye />}
						</button>
						<button
							type="button"
							onClick={onGenerate}
							css={{ background: 'transparent', border: 'none', cursor: 'pointer', color: theme.color.accent, padding: '0 12px', display: 'flex', alignItems: 'center' }}
							title="Generar contraseña de 50 caracteres"
						>
							<FiRefreshCw />
						</button>
					</>
				}
			/>
			<Input label="URL" value={draft.url} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft((d: EntryInput) => ({ ...d, url: e.target.value }))} />
			<Input label="Etiquetas (separadas por coma)" value={tagsText} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTagsText(e.target.value)} />
			<Input label="Notas" value={draft.notes} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft((d: EntryInput) => ({ ...d, notes: e.target.value }))} />
			<Button type="submit" full>{submitLabel}</Button>
		</form>
	);
}

export default GroupTablePage;
