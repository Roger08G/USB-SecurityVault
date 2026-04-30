/** @jsxImportSource @emotion/react */
import { css } from '@emotion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    FiArrowLeft,
    FiArrowDownCircle,
    FiArrowUpCircle,
    FiEye,
    FiEyeOff,
    FiLock,
    FiPlus,
    FiTrash2,
} from 'react-icons/fi';
import { Button } from '@shared/components/Button';
import { Input } from '@shared/components/Input';
import { Modal } from '@shared/components/Modal';
import { api, VaultError } from '@shared/api';
import { theme } from '@shared/theme';
import type {
    EntityInput,
    FinanceData,
    FinanceEntity,
    FinanceTx,
    TxInput,
    TxKind,
    Uuid,
} from '@shared/types';

interface FinancePageProps {
    onBack: () => void;
    onLock: () => void;
}

/* ───────────────────────────── helpers ───────────────────────────── */

const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const formatCents = (cents: number) => EUR.format(cents / 100);
const CENSORED = '••••••';

const parseAmountToCents = (raw: string): number | null => {
    const cleaned = raw.replace(/\s/g, '').replace(',', '.');
    if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
    const n = Math.round(parseFloat(cleaned) * 100);
    return Number.isFinite(n) ? n : null;
};

const monthKey = (iso: string) => iso.slice(0, 7);
const monthLabel = (key: string) => {
    const [y, m] = key.split('-');
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${months[parseInt(m, 10) - 1]} ${y.slice(2)}`;
};
const lastNMonths = (n: number): string[] => {
    const arr: string[] = [];
    const d = new Date();
    d.setDate(1);
    for (let i = n - 1; i >= 0; i--) {
        const d2 = new Date(d);
        d2.setMonth(d.getMonth() - i);
        arr.push(`${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}`);
    }
    return arr;
};

/* ───────────────────────────── styles ────────────────────────────── */

const pageStyles = css({
    position: 'relative', zIndex: 1,
    width: '100vw', height: '100vh',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
});

const headerStyles = css({
    width: '100%',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '24px 48px', boxSizing: 'border-box', flexShrink: 0,
});

const headingGroupStyles = css({ display: 'flex', alignItems: 'center', gap: 16 });

const titleStyles = css({
    margin: 0, fontSize: 28, fontWeight: 700,
    color: theme.color.text, letterSpacing: '-0.5px',
    '& span': {
        background: `linear-gradient(120deg, ${theme.color.nebulaPink}, ${theme.color.accentGlow})`,
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
    },
});

const contentStyles = css({
    flex: 1, overflowY: 'auto',
    padding: '0 48px 48px',
    display: 'flex', flexDirection: 'column', gap: 28,
    boxSizing: 'border-box',
});

const heroStyles = css({
    background: theme.color.bgElevated,
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.radius.xl,
    padding: '32px 40px',
    backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
    boxShadow: theme.shadow.card,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    gap: 24, flexWrap: 'wrap',
});

const heroLabelStyles = css({
    fontSize: 12, color: theme.color.textMuted,
    textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8,
});

const heroAmountWrapStyles = css({ display: 'flex', alignItems: 'center', gap: 16 });

const heroAmountStyles = (positive: boolean) => css({
    fontSize: 48, fontWeight: 700, fontFamily: theme.font.mono,
    background: positive
        ? `linear-gradient(120deg, ${theme.color.success}, ${theme.color.nebulaCyan})`
        : `linear-gradient(120deg, ${theme.color.danger}, ${theme.color.nebulaPink})`,
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
    letterSpacing: '-1px',
});

const heroActionsStyles = css({ display: 'flex', gap: 12, flexWrap: 'wrap' });

const sectionStyles = css({ display: 'flex', flexDirection: 'column', gap: 14 });

const sectionHeaderStyles = css({
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
});

const sectionTitleStyles = css({
    margin: 0, fontSize: 18, fontWeight: 600, color: theme.color.text,
});

const tableWrapStyles = css({
    background: theme.color.bgElevated,
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
    boxShadow: theme.shadow.card,
});

const tableStyles = css({ width: '100%', borderCollapse: 'collapse' });

const theadStyles = css({ borderBottom: `1px solid ${theme.color.border}` });

const thStyles = css({
    padding: '12px 20px',
    fontSize: 11, fontWeight: 600, color: theme.color.textMuted,
    textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left',
    background: 'rgba(255,255,255,0.02)',
});

const thRightStyles = css(thStyles, { textAlign: 'right' });

const trStyles = css({
    borderBottom: `1px solid ${theme.color.border}`,
    transition: `background ${theme.transition.base}`,
    '&:last-child': { borderBottom: 'none' },
    '&:hover': { background: theme.color.bgGlass },
});

const tdStyles = css({ padding: '14px 20px', fontSize: 14, color: theme.color.text, verticalAlign: 'middle' });
const tdMonoStyles = css(tdStyles, { fontFamily: theme.font.mono, fontSize: 13 });
const tdMutedStyles = css(tdStyles, { color: theme.color.textMuted });
const tdRightStyles = css(tdStyles, { textAlign: 'right' });

const amountCellStyles = (positive: boolean, censored: boolean) => css({
    fontFamily: theme.font.mono, fontSize: 15, fontWeight: 600,
    color: censored ? theme.color.textDim : positive ? theme.color.success : theme.color.danger,
    textAlign: 'right', letterSpacing: censored ? '0.1em' : 'normal', padding: '14px 20px',
    verticalAlign: 'middle',
});

const iconBtnStyles = css({
    background: 'transparent', border: 'none',
    color: theme.color.textDim, cursor: 'pointer',
    padding: 6, borderRadius: theme.radius.sm,
    display: 'inline-flex', alignItems: 'center',
    transition: `color ${theme.transition.base}, background ${theme.transition.base}`,
    '&:hover': { color: theme.color.danger, background: 'rgba(248, 113, 113, 0.1)' },
});

const txListStyles = css({
    background: theme.color.bgElevated,
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.radius.lg, overflow: 'hidden',
    backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
});

const txRowStyles = css({
    display: 'grid',
    gridTemplateColumns: '40px 1fr auto auto auto',
    alignItems: 'center', gap: 14,
    padding: '14px 22px',
    borderBottom: `1px solid ${theme.color.border}`,
    '&:last-child': { borderBottom: 'none' },
    transition: `background ${theme.transition.base}`,
    '&:hover': { background: theme.color.bgGlass },
});

const txKindIconStyles = (kind: TxKind) => css({
    width: 32, height: 32, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: kind === 'income' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(248, 113, 113, 0.15)',
    color: kind === 'income' ? theme.color.success : theme.color.danger,
    fontSize: 16,
});

const txNoteStyles = css({
    fontSize: 14, color: theme.color.text,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
});

const txEntityStyles = css({ fontSize: 12, color: theme.color.textMuted, marginTop: 2 });

const txAmountStyles = (kind: TxKind, censored: boolean) => css({
    fontSize: 15, fontWeight: 600, fontFamily: theme.font.mono,
    color: censored ? theme.color.textDim : kind === 'income' ? theme.color.success : theme.color.danger,
    minWidth: 110, textAlign: 'right',
    letterSpacing: censored ? '0.1em' : 'normal',
});

const txDateStyles = css({ fontSize: 12, color: theme.color.textDim, fontFamily: theme.font.mono });

const emptyStyles = css({
    padding: '32px 22px', textAlign: 'center',
    color: theme.color.textMuted, fontSize: 14,
});

const chartCardStyles = css({
    background: theme.color.bgElevated, border: `1px solid ${theme.color.border}`,
    borderRadius: theme.radius.lg, padding: '22px 24px',
    backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
});

const chartLegendStyles = css({
    display: 'flex', gap: 18, marginTop: 12, fontSize: 12, color: theme.color.textMuted,
});

const legendDotStyles = (color: string) => css({
    display: 'inline-block', width: 10, height: 10,
    borderRadius: 2, background: color, marginRight: 6, verticalAlign: 'middle',
});

const deleteBodyStyles = css({ display: 'flex', flexDirection: 'column', gap: 18 });
const deleteTextStyles = css({ margin: 0, fontSize: 15, color: theme.color.textMuted, lineHeight: 1.6 });
const deleteActionsStyles = css({ display: 'flex', justifyContent: 'flex-end', gap: 8 });

const revealBtnStyles = css({
    background: 'transparent', border: `1px solid ${theme.color.border}`,
    borderRadius: theme.radius.md, color: theme.color.textMuted,
    cursor: 'pointer', padding: '6px 12px',
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 12, fontFamily: theme.font.sans,
    transition: `all ${theme.transition.base}`,
    '&:hover': { borderColor: theme.color.borderStrong, color: theme.color.text },
});

/* ──────────────────────────── component ──────────────────────────── */

export function FinancePage({ onBack, onLock }: FinancePageProps) {
    const [data, setData] = useState<FinanceData>({ entities: [], transactions: [] });
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const [censored, setCensored] = useState(true);
    const [totpModalOpen, setTotpModalOpen] = useState(false);

    const [entityModalOpen, setEntityModalOpen] = useState(false);
    const [txModalOpen, setTxModalOpen] = useState<TxKind | null>(null);
    const [deleteEntity, setDeleteEntity] = useState<FinanceEntity | null>(null);
    const [deleteTx, setDeleteTx] = useState<FinanceTx | null>(null);

    const refresh = useCallback(async () => {
        try {
            const d = await api.financeGet();
            setData(d);
            setErrorMsg(null);
        } catch (err) {
            setErrorMsg(err instanceof VaultError ? err.detail.kind : String(err));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    const total = useMemo(
        () => data.entities.reduce((acc, e) => acc + e.amount_cents, 0),
        [data.entities],
    );

    const entitiesById = useMemo(() => {
        const m = new Map<Uuid, FinanceEntity>();
        for (const e of data.entities) m.set(e.id, e);
        return m;
    }, [data.entities]);

    const sortedTx = useMemo(
        () => [...data.transactions].sort((a, b) => b.created_at.localeCompare(a.created_at)),
        [data.transactions],
    );

    const monthly = useMemo(() => {
        const months = lastNMonths(6);
        const map = new Map<string, { income: number; expense: number }>();
        for (const m of months) map.set(m, { income: 0, expense: 0 });
        for (const t of data.transactions) {
            const k = monthKey(t.created_at);
            const entry = map.get(k);
            if (!entry) continue;
            if (t.kind === 'income') entry.income += t.amount_cents;
            else entry.expense += t.amount_cents;
        }
        return months.map((m) => ({ month: m, ...map.get(m)! }));
    }, [data.transactions]);

    const confirmDeleteEntity = async () => {
        if (!deleteEntity) return;
        try {
            await api.financeDeleteEntity(deleteEntity.id);
            setDeleteEntity(null);
            await refresh();
        } catch (err) {
            alert(err instanceof VaultError ? err.detail.kind : String(err));
        }
    };

    const confirmDeleteTx = async () => {
        if (!deleteTx) return;
        try {
            await api.financeDeleteTx(deleteTx.id);
            setDeleteTx(null);
            await refresh();
        } catch (err) {
            alert(err instanceof VaultError ? err.detail.kind : String(err));
        }
    };

    return (
        <main css={pageStyles}>
            <header css={headerStyles}>
                <div css={headingGroupStyles}>
                    <Button variant="ghost" size="sm" leftIcon={<FiArrowLeft />} onClick={onBack}>
                        Volver
                    </Button>
                    <h1 css={titleStyles}>Tu <span>patrimonio</span></h1>
                </div>
                <Button variant="ghost" leftIcon={<FiLock />} onClick={onLock}>
                    Bloquear
                </Button>
            </header>

            <section css={contentStyles}>
                {/* Hero */}
                <div css={heroStyles}>
                    <div>
                        <div css={heroLabelStyles}>Total acumulado</div>
                        <div css={heroAmountWrapStyles}>
                            <div css={heroAmountStyles(total >= 0)}>
                                {censored ? CENSORED : formatCents(total)}
                            </div>
                            <button
                                css={revealBtnStyles}
                                onClick={() => {
                                    if (censored) setTotpModalOpen(true);
                                    else setCensored(true);
                                }}
                                title={censored ? 'Mostrar cantidades (requiere TOTP)' : 'Ocultar cantidades'}
                            >
                                {censored ? <FiEye size={14} /> : <FiEyeOff size={14} />}
                                {censored ? 'Mostrar' : 'Ocultar'}
                            </button>
                        </div>
                    </div>
                    <div css={heroActionsStyles}>
                        <Button
                            variant="primary"
                            leftIcon={<FiArrowUpCircle />}
                            onClick={() => setTxModalOpen('income')}
                            disabled={data.entities.length === 0}
                        >
                            Nuevo ingreso
                        </Button>
                        <Button
                            variant="danger"
                            leftIcon={<FiArrowDownCircle />}
                            onClick={() => setTxModalOpen('expense')}
                            disabled={data.entities.length === 0}
                        >
                            Nuevo gasto
                        </Button>
                    </div>
                </div>

                {errorMsg && (
                    <div css={{ color: theme.color.danger, fontSize: 13 }}>Error: {errorMsg}</div>
                )}

                {/* Entities table */}
                <div css={sectionStyles}>
                    <div css={sectionHeaderStyles}>
                        <h2 css={sectionTitleStyles}>Entidades</h2>
                        <Button variant="ghost" size="sm" leftIcon={<FiPlus />} onClick={() => setEntityModalOpen(true)}>
                            Nueva entidad
                        </Button>
                    </div>
                    {loading ? (
                        <div css={emptyStyles}>Cargando…</div>
                    ) : data.entities.length === 0 ? (
                        <div css={emptyStyles}>Aún no hay entidades.</div>
                    ) : (
                        <div css={tableWrapStyles}>
                            <table css={tableStyles}>
                                <thead css={theadStyles}>
                                    <tr>
                                        <th css={thStyles}>Nombre</th>
                                        <th css={thStyles}>Banco</th>
                                        <th css={thStyles}>IBAN</th>
                                        <th css={thRightStyles}>Saldo</th>
                                        <th css={thRightStyles} />
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.entities.map((e) => (
                                        <tr key={e.id} css={trStyles}>
                                            <td css={tdStyles} style={{ fontWeight: 600 }}>{e.title}</td>
                                            <td css={tdMutedStyles}>{e.bank ?? '—'}</td>
                                            <td css={tdMonoStyles}>{e.iban ?? '—'}</td>
                                            <td css={amountCellStyles(e.amount_cents >= 0, censored)}>
                                                {censored ? CENSORED : formatCents(e.amount_cents)}
                                            </td>
                                            <td css={tdRightStyles}>
                                                <button
                                                    css={iconBtnStyles}
                                                    onClick={() => setDeleteEntity(e)}
                                                    title="Eliminar"
                                                >
                                                    <FiTrash2 size={15} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Monthly chart */}
                <div css={sectionStyles}>
                    <div css={sectionHeaderStyles}>
                        <h2 css={sectionTitleStyles}>Últimos 6 meses</h2>
                    </div>
                    <div css={chartCardStyles}>
                        <MonthlyChart data={monthly} censored={censored} />
                        <div css={chartLegendStyles}>
                            <span><span css={legendDotStyles(theme.color.success)} />Ingresos</span>
                            <span><span css={legendDotStyles(theme.color.danger)} />Gastos</span>
                        </div>
                    </div>
                </div>

                {/* Transactions */}
                <div css={sectionStyles}>
                    <div css={sectionHeaderStyles}>
                        <h2 css={sectionTitleStyles}>Movimientos recientes</h2>
                    </div>
                    <div css={txListStyles}>
                        {sortedTx.length === 0 ? (
                            <div css={emptyStyles}>Sin movimientos todavía.</div>
                        ) : (
                            sortedTx.slice(0, 50).map((tx) => {
                                const ent = entitiesById.get(tx.entity_id);
                                const sign = tx.kind === 'income' ? '+' : '-';
                                return (
                                    <div key={tx.id} css={txRowStyles}>
                                        <div css={txKindIconStyles(tx.kind)}>
                                            {tx.kind === 'income' ? <FiArrowUpCircle /> : <FiArrowDownCircle />}
                                        </div>
                                        <div css={{ minWidth: 0 }}>
                                            <div css={txNoteStyles}>{tx.note || (tx.kind === 'income' ? 'Ingreso' : 'Gasto')}</div>
                                            <div css={txEntityStyles}>{ent?.title ?? '—'}</div>
                                        </div>
                                        <div css={txAmountStyles(tx.kind, censored)}>
                                            {censored ? CENSORED : `${sign}${formatCents(tx.amount_cents)}`}
                                        </div>
                                        <div css={txDateStyles}>
                                            {new Date(tx.created_at).toLocaleDateString('es-ES')}
                                        </div>
                                        <button
                                            css={iconBtnStyles}
                                            onClick={() => setDeleteTx(tx)}
                                            title="Eliminar"
                                        >
                                            <FiTrash2 size={15} />
                                        </button>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </section>

            {/* ── Modals ── */}
            <TotpGateModal
                open={totpModalOpen}
                onClose={() => setTotpModalOpen(false)}
                onVerified={() => { setTotpModalOpen(false); setCensored(false); }}
            />

            <EntityFormModal
                open={entityModalOpen}
                onClose={() => setEntityModalOpen(false)}
                onSaved={() => { setEntityModalOpen(false); void refresh(); }}
            />

            <TxFormModal
                kind={txModalOpen}
                entities={data.entities}
                onClose={() => setTxModalOpen(null)}
                onSaved={() => { setTxModalOpen(null); void refresh(); }}
            />

            <Modal open={deleteEntity !== null} onClose={() => setDeleteEntity(null)} title="Eliminar entidad" width={420}>
                <div css={deleteBodyStyles}>
                    <p css={deleteTextStyles}>
                        ¿Eliminar <strong css={{ color: theme.color.text }}>{deleteEntity?.title}</strong> y todas sus transacciones?
                        Esta acción no se puede deshacer.
                    </p>
                    <div css={deleteActionsStyles}>
                        <Button variant="ghost" onClick={() => setDeleteEntity(null)}>Cancelar</Button>
                        <Button variant="danger" onClick={confirmDeleteEntity}>Eliminar</Button>
                    </div>
                </div>
            </Modal>

            <Modal open={deleteTx !== null} onClose={() => setDeleteTx(null)} title="Eliminar movimiento" width={420}>
                <div css={deleteBodyStyles}>
                    <p css={deleteTextStyles}>
                        ¿Eliminar el movimiento{' '}
                        <strong css={{ color: theme.color.text }}>
                            {deleteTx?.note || (deleteTx?.kind === 'income' ? 'Ingreso' : 'Gasto')}
                        </strong>?
                        El saldo de la entidad se revertirá automáticamente.
                    </p>
                    <div css={deleteActionsStyles}>
                        <Button variant="ghost" onClick={() => setDeleteTx(null)}>Cancelar</Button>
                        <Button variant="danger" onClick={confirmDeleteTx}>Eliminar</Button>
                    </div>
                </div>
            </Modal>
        </main>
    );
}

/* ───────────────────────── TOTP gate modal ───────────────────────── */

function TotpGateModal({
    open, onClose, onVerified,
}: { open: boolean; onClose: () => void; onVerified: () => void }) {
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => { if (open) { setCode(''); setErr(null); } }, [open]);

    const submit = async () => {
        if (code.trim().length < 6) { setErr('Introduce el código de 6 dígitos'); return; }
        setBusy(true);
        try {
            await api.verifyTotp(code.trim());
            onVerified();
        } catch (e) {
            setErr(e instanceof VaultError ? 'Código incorrecto' : String(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose} title="Verificación TOTP" width={400}>
            <div css={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p css={{ margin: 0, fontSize: 14, color: theme.color.textMuted, lineHeight: 1.6 }}>
                    Introduce el código de tu autenticador para mostrar las cantidades.
                </p>
                <Input
                    label="Código TOTP"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void submit()}
                    maxLength={6}
                    monospace
                    autoFocus
                    placeholder="000000"
                />
                {err && <span css={{ color: theme.color.danger, fontSize: 12 }}>{err}</span>}
                <div css={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                    <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
                    <Button onClick={submit} disabled={busy}>{busy ? 'Verificando…' : 'Verificar'}</Button>
                </div>
            </div>
        </Modal>
    );
}

/* ─────────────────────────── Monthly chart ───────────────────────── */

interface MonthRow { month: string; income: number; expense: number; }

function MonthlyChart({ data, censored }: { data: MonthRow[]; censored: boolean }) {
    const W = 720, H = 220, padL = 50, padR = 16, padT = 16, padB = 36;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    const maxVal = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
    const groupW = innerW / data.length;
    const barW = Math.min(22, (groupW - 8) / 2);
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((p) => Math.round(maxVal * p));

    return (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="xMidYMid meet">
            {ticks.map((t, i) => {
                const y = padT + innerH - (t / maxVal) * innerH;
                return (
                    <g key={i}>
                        <line x1={padL} x2={W - padR} y1={y} y2={y}
                            stroke={theme.color.border} strokeDasharray="2 4" />
                        <text x={padL - 8} y={y + 4} textAnchor="end"
                            fontSize="10" fill={theme.color.textDim} fontFamily={theme.font.mono}>
                            {censored ? '•••' : `${(t / 100).toFixed(0)}€`}
                        </text>
                    </g>
                );
            })}
            {data.map((d, i) => {
                const cx = padL + i * groupW + groupW / 2;
                const incomeH = (d.income / maxVal) * innerH;
                const expenseH = (d.expense / maxVal) * innerH;
                const incY = padT + innerH - incomeH;
                const expY = padT + innerH - expenseH;
                return (
                    <g key={d.month}>
                        <rect x={cx - barW - 2} y={incY} width={barW} height={incomeH}
                            rx={3} fill={theme.color.success} opacity={censored ? 0.3 : 0.9} />
                        <rect x={cx + 2} y={expY} width={barW} height={expenseH}
                            rx={3} fill={theme.color.danger} opacity={censored ? 0.3 : 0.9} />
                        <text x={cx} y={H - padB + 16} textAnchor="middle"
                            fontSize="11" fill={theme.color.textMuted}>
                            {monthLabel(d.month)}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

/* ─────────────────────────── Entity Modal ────────────────────────── */

function EntityFormModal({
    open, onClose, onSaved,
}: { open: boolean; onClose: () => void; onSaved: () => void }) {
    const [title, setTitle] = useState('');
    const [amount, setAmount] = useState('0');
    const [iban, setIban] = useState('');
    const [bank, setBank] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        if (open) { setTitle(''); setAmount('0'); setIban(''); setBank(''); setErr(null); }
    }, [open]);

    const submit = async () => {
        const cents = parseAmountToCents(amount);
        if (cents === null) { setErr('Cantidad inválida'); return; }
        if (!title.trim()) { setErr('Título obligatorio'); return; }
        setBusy(true);
        try {
            const input: EntityInput = {
                title: title.trim(),
                amount_cents: cents,
                iban: iban.trim() || null,
                bank: bank.trim() || null,
            };
            await api.financeCreateEntity(input);
            onSaved();
        } catch (e) {
            setErr(e instanceof VaultError ? e.detail.kind : String(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose} title="Nueva entidad" width={460}>
            <div css={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Input label="Título" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Cuenta nómina, Ahorros…" />
                <Input label="Cantidad inicial (€)" value={amount} onChange={(e) => setAmount(e.target.value)} monospace placeholder="0.00" />
                <Input label="IBAN (opcional)" value={iban} onChange={(e) => setIban(e.target.value)} monospace placeholder="ES00 0000 0000 0000 0000 0000" />
                <Input label="Banco (opcional)" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Santander, BBVA…" />
                {err && <span css={{ color: theme.color.danger, fontSize: 12 }}>{err}</span>}
                <div css={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                    <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
                    <Button onClick={submit} disabled={busy}>{busy ? 'Guardando…' : 'Crear'}</Button>
                </div>
            </div>
        </Modal>
    );
}

/* ───────────────────────────── Tx Modal ──────────────────────────── */

function TxFormModal({
    kind, entities, onClose, onSaved,
}: { kind: TxKind | null; entities: FinanceEntity[]; onClose: () => void; onSaved: () => void }) {
    const open = kind !== null;
    const [entityId, setEntityId] = useState<Uuid>('');
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        if (open) { setEntityId(entities[0]?.id ?? ''); setAmount(''); setNote(''); setErr(null); }
    }, [open, entities]);

    const submit = async () => {
        if (!kind) return;
        const cents = parseAmountToCents(amount);
        if (cents === null || cents <= 0) { setErr('Cantidad inválida (debe ser positiva)'); return; }
        if (!entityId) { setErr('Selecciona una entidad'); return; }
        setBusy(true);
        try {
            const input: TxInput = { entity_id: entityId, kind, amount_cents: cents, note: note.trim() };
            await api.financeCreateTx(input);
            onSaved();
        } catch (e) {
            setErr(e instanceof VaultError ? e.detail.kind : String(e));
        } finally {
            setBusy(false);
        }
    };

    const isIncome = kind === 'income';

    return (
        <Modal open={open} onClose={onClose} title={isIncome ? 'Registrar ingreso' : 'Registrar gasto'} width={460}>
            <div css={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <label css={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span css={{ fontSize: 12, color: theme.color.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Entidad
                    </span>
                    <select
                        value={entityId}
                        onChange={(e) => setEntityId(e.target.value)}
                        css={{
                            background: theme.color.bgElevated, color: theme.color.text,
                            border: `1px solid ${theme.color.border}`, borderRadius: theme.radius.md,
                            padding: '12px 14px', fontFamily: theme.font.sans, fontSize: 14, outline: 'none',
                            '&:focus': { borderColor: theme.color.borderStrong, boxShadow: '0 0 0 3px rgba(167, 139, 250, 0.15)' },
                        }}
                    >
                        {entities.map((e) => (
                            <option key={e.id} value={e.id} css={{ background: theme.color.bgDeep }}>
                                {e.title}
                            </option>
                        ))}
                    </select>
                </label>
                <Input label="Cantidad (€)" value={amount} onChange={(e) => setAmount(e.target.value)} monospace placeholder="0.00" autoFocus />
                <Input label="Concepto (opcional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder={isIncome ? 'Nómina, regalo…' : 'Compra, factura…'} />
                {err && <span css={{ color: theme.color.danger, fontSize: 12 }}>{err}</span>}
                <div css={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                    <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
                    <Button variant={isIncome ? 'primary' : 'danger'} onClick={submit} disabled={busy}>
                        {busy ? 'Guardando…' : isIncome ? 'Registrar ingreso' : 'Registrar gasto'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

export default FinancePage;
