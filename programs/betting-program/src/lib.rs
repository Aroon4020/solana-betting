use anchor_lang::prelude::*;
use solana_program::account_info::AccountInfo;

mod error;
mod state;
mod constants;
mod instructions;
pub mod utils; 

use instructions::*; 

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod event_betting {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        fee_percentage: u64,
        signer: Pubkey,
        token_mint: Pubkey,
    ) -> Result<()> {
        initialize::handler(ctx, fee_percentage, signer, token_mint)
    }

    pub fn create_event(
        ctx: Context<CreateEvent>,
        description: String,
        start_time: i64,
        deadline: i64,
        possible_outcomes: Vec<String>,
        voucher_amount: u64,
    ) -> Result<()> {
        create_event::create_event_handler(
            ctx,
            description,
            start_time.try_into().unwrap(),  
            deadline.try_into().unwrap(),    
            possible_outcomes,
            voucher_amount,
        )
    }

    pub fn place_bet(
        ctx: Context<PlaceBet>,
        outcome: String,
        amount: u64,
        vouched_amount: u64,
    ) -> Result<()> {
        instructions::place_bet::place_bet_handler(ctx, outcome, amount, vouched_amount)
    }

    pub fn resolve_event(ctx: Context<ResolveEvent>, winning_outcome: String) -> Result<()> {
        resolve_event::resolve_event_handler(ctx, winning_outcome)
    }

    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        claim_winnings::claim_winnings_handler(ctx)
    }

    pub fn update_voucher_amount(ctx: Context<UpdateVoucherAmount>, new_voucher_amount: u64) -> Result<()> {
        update_voucher_amount::update_voucher_amount_handler(ctx, new_voucher_amount)
    }

    pub fn withdraw_fees(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
        withdraw_fees::withdraw_fees_handler(ctx, amount)
    }

    pub fn revoke_event(ctx: Context<RevokeEvent>) -> Result<()> {
        revoke_event::revoke_event_handler(ctx)
    }

    pub fn increase_deadline(ctx: Context<IncreaseDeadline>, new_deadline: i64) -> Result<()> {
        increase_deadline::increase_deadline_handler(ctx, new_deadline.try_into().unwrap())
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        new_owner: Option<Pubkey>,
        new_signer: Option<Pubkey>,
        new_fee_percentage: Option<u16>,
    ) -> Result<()> {
        update_config::update_config_handler(ctx, new_owner, new_signer, new_fee_percentage)
    }

    pub fn add_voucher_funds(ctx: Context<AddVoucherFunds>, amount: u64) -> Result<()> {
        add_voucher_funds::add_voucher_funds_handler(ctx, amount)
    }

    pub fn initialize_event_pool(ctx: Context<InitializeEventPool>) -> Result<()> {
        initialize_event_pool::initialize_event_pool_handler(ctx)
    }

    pub fn close_user_bet(ctx: Context<CloseUserBet>) -> Result<()> {
        close_user_bet_handler(ctx)
    }
}