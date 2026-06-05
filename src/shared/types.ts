/**
 * Domain types mirroring the Rust DTOs in `commands.rs`.
 * Keep in sync.
 */

export type Uuid = string;

export interface VaultStatus {
    initialized: boolean;
    unlocked: boolean;
    totp_verified: boolean;
}

export interface InitResult {
    otpauth_uri: string;
    totp_secret_b32: string;
}

export interface GroupSummary {
    id: Uuid;
    name: string;
    description: string;
    icon: string | null;
    entry_count: number;
}

export interface EntryView {
    id: Uuid;
    title: string;
    username: string;
    url: string;
    notes: string;
    tags: string[];
    icon: string | null;
    created_at: string;
    updated_at: string;
}

export interface EntryInput {
    title: string;
    username: string;
    password: string;
    url: string;
    notes: string;
    tags: string[];
    icon: string | null;
}

export type VaultErrorKind =
    | { kind: "invalid" }
    | { kind: "locked" }
    | { kind: "already_initialized" }
    | { kind: "not_initialized" }
    | { kind: "rate_limited"; seconds: number }
    | { kind: "internal"; message: string };

/* ───────────────────────────── Finance ───────────────────────────── */

export type TxKind = "income" | "expense";

export interface FinanceEntity {
    id: Uuid;
    title: string;
    amount_cents: number;
    iban: string | null;
    bank: string | null;
    created_at: string;
}

export interface FinanceTx {
    id: Uuid;
    entity_id: Uuid;
    kind: TxKind;
    amount_cents: number;
    note: string;
    created_at: string;
}

export interface FinanceData {
    entities: FinanceEntity[];
    transactions: FinanceTx[];
}

export interface EntityInput {
    title: string;
    amount_cents: number;
    iban: string | null;
    bank: string | null;
}

export interface TxInput {
    entity_id: Uuid;
    kind: TxKind;
    amount_cents: number;
    note: string;
}
