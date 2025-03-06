use solana_program::hash::{hash, Hash};

/// Returns a SHA256 hash of the input outcome string.
pub fn hash_outcome(outcome: &str) -> [u8; 32] {
    let Hash(result) = hash(outcome.as_bytes());
    result
}
