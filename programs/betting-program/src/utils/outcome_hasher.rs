use solana_program::hash::{hash, Hash};

pub fn hash_outcome(outcome: &str) -> [u8; 32] {
    // Use to_bytes() to get the underlying array.
    hash(outcome.as_bytes()).to_bytes()
}
