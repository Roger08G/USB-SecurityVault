//! Vault data model: groups → entries.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entry {
    pub id: Uuid,
    pub title: String,
    pub username: String,
    pub password: String,
    pub url: String,
    pub notes: String,
    pub tags: Vec<String>,
    pub icon: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Group {
    pub id: Uuid,
    pub name: String,
    pub description: String,
    pub icon: Option<String>,
    pub entries: Vec<Entry>,
}

/// Top-level encrypted payload.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultData {
    pub version: u32,
    pub totp_secret_b32: String, // RFC 4648 base32 — TOTP seed
    pub groups: Vec<Group>,
    #[serde(default)]
    pub finance: FinanceData,
}

impl VaultData {
    pub fn new(totp_secret_b32: String) -> Self {
        let now = Utc::now();
        let _ = now;
        Self {
            version: 1,
            totp_secret_b32,
            groups: vec![Group {
                id: Uuid::new_v4(),
                name: "Personal".into(),
                description: "Cuentas personales".into(),
                icon: None,
                entries: vec![],
            }],
            finance: FinanceData::default_seed(),
        }
    }
}

/* ───────────────────────── Finance domain ───────────────────────── */

/// A money holder: cash, bank account, etc.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FinanceEntity {
    pub id: Uuid,
    pub title: String,
    /// Stored in cents to avoid floating-point drift.
    pub amount_cents: i64,
    pub iban: Option<String>,
    pub bank: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TxKind {
    Income,
    Expense,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FinanceTx {
    pub id: Uuid,
    pub entity_id: Uuid,
    pub kind: TxKind,
    /// Always positive cents. Sign is implied by `kind`.
    pub amount_cents: i64,
    pub note: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FinanceData {
    pub entities: Vec<FinanceEntity>,
    pub transactions: Vec<FinanceTx>,
}

impl FinanceData {
    pub fn default_seed() -> Self {
        Self {
            entities: vec![FinanceEntity {
                id: Uuid::new_v4(),
                title: "Efectivo".into(),
                amount_cents: 0,
                iban: None,
                bank: None,
                created_at: Utc::now(),
            }],
            transactions: vec![],
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct EntityInput {
    pub title: String,
    pub amount_cents: i64,
    pub iban: Option<String>,
    pub bank: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TxInput {
    pub entity_id: Uuid,
    pub kind: TxKind,
    pub amount_cents: i64,
    pub note: String,
}

/// Public DTOs (without password unless explicitly requested).
#[derive(Debug, Serialize)]
pub struct GroupSummary {
    pub id: Uuid,
    pub name: String,
    pub description: String,
    pub icon: Option<String>,
    pub entry_count: usize,
}

#[derive(Debug, Serialize)]
pub struct EntryView {
    pub id: Uuid,
    pub title: String,
    pub username: String,
    pub url: String,
    pub notes: String,
    pub tags: Vec<String>,
    pub icon: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<&Entry> for EntryView {
    fn from(e: &Entry) -> Self {
        Self {
            id: e.id,
            title: e.title.clone(),
            username: e.username.clone(),
            url: e.url.clone(),
            notes: e.notes.clone(),
            tags: e.tags.clone(),
            icon: e.icon.clone(),
            created_at: e.created_at,
            updated_at: e.updated_at,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct EntryInput {
    pub title: String,
    pub username: String,
    pub password: String,
    pub url: String,
    pub notes: String,
    pub tags: Vec<String>,
    pub icon: Option<String>,
}
