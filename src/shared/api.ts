/**
 * Typed bridge to Rust commands. All vault operations go through here.
 * Errors are normalized to `VaultErrorKind`.
 */
import { invoke } from "@tauri-apps/api/core";
import type {
    EntityInput,
    EntryInput,
    EntryView,
    FinanceData,
    FinanceEntity,
    FinanceTx,
    GroupSummary,
    InitResult,
    TxInput,
    Uuid,
    VaultErrorKind,
    VaultStatus,
} from "@shared/types";

export class VaultError extends Error {
    public readonly detail: VaultErrorKind;
    constructor(detail: VaultErrorKind) {
        super(detail.kind);
        this.detail = detail;
    }
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    try {
        return await invoke<T>(cmd, args);
    } catch (raw) {
        // Rust errors are serialized as { kind: '...' } objects; fall back to internal.
        if (raw && typeof raw === "object" && "kind" in (raw as object)) {
            throw new VaultError(raw as VaultErrorKind);
        }
        throw new VaultError({ kind: "internal", message: String(raw) });
    }
}

export const api = {
    status: (root_override?: string) =>
        call<VaultStatus>("vault_status", { rootOverride: root_override ?? null }),

    init: (password: string, root_override?: string) =>
        call<InitResult>("vault_init", { password, rootOverride: root_override ?? null }),

    unlock: (password: string, root_override?: string) =>
        call<void>("vault_unlock", { password, rootOverride: root_override ?? null }),

    verifyTotp: (code: string) => call<void>("vault_verify_totp", { code }),

    lock: () => call<void>("vault_lock"),

    getOtpauth: () => call<string>("vault_get_otpauth"),

    listGroups: () => call<GroupSummary[]>("list_groups"),

    createGroup: (name: string, description: string, icon: string | null) =>
        call<GroupSummary>("create_group", { name, description, icon }),

    deleteGroup: (groupId: Uuid) => call<void>("delete_group", { groupId }),

    listEntries: (groupId: Uuid) => call<EntryView[]>("list_entries", { groupId }),

    createEntry: (groupId: Uuid, input: EntryInput) =>
        call<EntryView>("create_entry", { groupId, input }),

    updateEntry: (groupId: Uuid, entryId: Uuid, input: EntryInput) =>
        call<EntryView>("update_entry", { groupId, entryId, input }),

    deleteEntry: (groupId: Uuid, entryId: Uuid) => call<void>("delete_entry", { groupId, entryId }),

    revealPassword: (groupId: Uuid, entryId: Uuid) =>
        call<string>("reveal_password", { groupId, entryId }),

    generatePassword: (length: number, symbols: boolean) =>
        call<string>("generate_password", { length, symbols }),

    saveUpload: (filename: string, data: number[]) =>
        call<string>("save_upload", { filename, data }),

    listUploads: () => call<{ name: string; path: string }[]>("list_uploads"),

    getUploadsDir: () => call<string>("get_uploads_dir"),

    financeGet: () => call<FinanceData>("finance_get"),

    financeCreateEntity: (input: EntityInput) =>
        call<FinanceEntity>("finance_create_entity", { input }),

    financeUpdateEntity: (entityId: Uuid, input: EntityInput) =>
        call<FinanceEntity>("finance_update_entity", { entityId, input }),

    financeDeleteEntity: (entityId: Uuid) => call<void>("finance_delete_entity", { entityId }),

    financeCreateTx: (input: TxInput) => call<FinanceTx>("finance_create_tx", { input }),

    financeDeleteTx: (txId: Uuid) => call<void>("finance_delete_tx", { txId }),
};
