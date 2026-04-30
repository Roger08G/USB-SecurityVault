//! Anti brute-force throttling.
//!
//! 1 failed attempt → wait 30 minutes
//! 2 failed attempts → wait 3 hours
//! 3+ failed attempts → wait 24 hours (cap)

use chrono::Utc;

use crate::{
    error::{VaultError, VaultResult},
    storage::ConfigState,
};

pub fn penalty_seconds(failed: u32) -> u64 {
    match failed {
        0 => 0,
        1 => 30 * 60,
        2 => 3 * 60 * 60,
        _ => 24 * 60 * 60,
    }
}

pub fn check_rate_limit(cfg: &ConfigState) -> VaultResult<()> {
    let penalty = penalty_seconds(cfg.failed_attempts);
    if penalty == 0 {
        return Ok(());
    }
    let now = Utc::now().timestamp();
    let elapsed = (now - cfg.last_failed_unix).max(0) as u64;
    if elapsed < penalty {
        return Err(VaultError::RateLimited {
            seconds: penalty - elapsed,
        });
    }
    Ok(())
}

pub fn record_failure(cfg: &mut ConfigState) {
    cfg.failed_attempts = cfg.failed_attempts.saturating_add(1);
    cfg.last_failed_unix = Utc::now().timestamp();
}

pub fn reset_failures(cfg: &mut ConfigState) {
    cfg.failed_attempts = 0;
    cfg.last_failed_unix = 0;
}
