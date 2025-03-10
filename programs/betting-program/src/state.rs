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
    pub description: String, 
    pub outcomes: Vec<String>,          
    pub winning_outcome: Option<String>,  
    pub start_time: u64,
    pub deadline: u64,
    pub total_pool: u64,
    pub voucher_amount: u64,
    pub total_voucher_claimed: u64,
    pub total_bets_by_outcome: Vec<u64>,
    pub resolved: bool,
}


#[account]
pub struct UserBet {
    pub user: Pubkey,
    pub event_id: u64,
    pub outcome: String,
    pub amount: u64,
}

impl UserBet {
    pub const LEN: usize = 8 + 32 + 8 + 20 + 8 + 8;
}