use anchor_lang::prelude::*;

#[account]
pub struct ProgramState {
    pub fee_percentage: u64,
    pub signer: Pubkey,
    pub owner: Pubkey,
    pub next_event_id: u64,
    pub accumulated_fees: u64,
    pub active_vouchers_amount: u64,
    pub token_mint: Pubkey,
}

impl ProgramState {
    pub const LEN: usize = 128;
}

#[account]
pub struct Event {
    pub id: u64,
    pub description: String, // fixed max length at creation (e.g. 256 bytes)
    pub outcomes: Vec<[u8; 32]>,          // fixed-size outcome hashes
    pub winning_outcome: Option<[u8; 32]>,  // fixed-size hash for winner
    pub start_time: u64,   // Changed from i64 to u64
    pub deadline: u64,     // Changed from i64 to u64
    pub total_pool: u64,
    pub voucher_amount: u64,
    pub total_voucher_claimed: u64,
    pub total_bets_by_outcome: Vec<u64>,
    pub resolved: bool,
}

impl Event {
    // For example, assume:
    // id: 8, description:256, outcomes: 4+10*32, winning_outcome: 33, start_time:8, deadline:8,
    // total_pool:8, voucher_amount:8, total_voucher_claimed:8, total_bets_by_outcome: 4+10*8, resolved:1.
    // Adjusted using u64 for start_time and deadline (size remains 8 bytes each)
    pub const LEN: usize = 8 + 256 + (4 + 10 * 32) + 33 + (8 + 8) + 8 + 8 + 8 + (4 + 10 * 8) + 1;
}

#[account]
pub struct UserBet {
    pub user: Pubkey,
    pub event_id: u64,
    pub outcome: [u8; 32], // outcome stored as hash (default [0u8;32] if unset)
    pub amount: u64,
    pub nonce: u64,
}

impl UserBet {
    pub const LEN: usize = 8 + 32 + 8 + 32 + 8 + 8;
}