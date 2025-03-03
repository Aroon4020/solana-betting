use anchor_lang::prelude::*;
use solana_program::account_info::AccountInfo;

mod error;
mod state;
mod constants;
mod instructions;

use instructions::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod event_betting {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, fee_percentage: u64, signer: Pubkey) -> Result<()> {
        // Call the function "handler" as defined in initialize.rs
        instructions::initialize::handler(ctx, fee_percentage, signer)
    }

    pub fn create_event(
        ctx: Context<CreateEvent>,
        description: String,
        start_time: i64,
        deadline: i64,
        possible_outcomes: Vec<String>,
        voucher_amount: u64,
    ) -> Result<()> {
        instructions::create_event::create_event_handler(ctx, description, start_time, deadline, possible_outcomes, voucher_amount)
    }

    pub fn initialize_fee_pool(ctx: Context<InitializeFeePool>) -> Result<()> {
        instructions::initialize_fee_pool::initialize_fee_pool_handler(ctx)
    }

    pub fn place_bet(
        ctx: Context<PlaceBet>,
        outcome: String,
        amount: u64,
    ) -> Result<()> {
        instructions::place_bet::place_bet_handler(ctx, outcome, amount)
    }

    pub fn place_bet_with_voucher(
        ctx: Context<PlaceBetWithVoucher>,
        outcome: String,
        amount: u64,
        vouched_amount: u64,
        nonce: u64,
    ) -> Result<()> {
        instructions::place_bet_with_voucher::place_bet_with_voucher_handler(
            ctx,
            outcome,
            amount,
            vouched_amount,
            nonce,
        )
    }

    pub fn resolve_event(ctx: Context<ResolveEvent>, winning_outcome: String) -> Result<()> {
        instructions::resolve_event::resolve_event_handler(ctx, winning_outcome)
    }

    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        instructions::claim_winnings::claim_winnings_handler(ctx)
    }

    pub fn update_voucher_amount(
        ctx: Context<UpdateVoucherAmount>,
        new_voucher_amount: u64,
    ) -> Result<()> {
        instructions::update_voucher_amount::update_voucher_amount_handler(ctx, new_voucher_amount)
    }

    pub fn withdraw_fees(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
        instructions::withdraw_fees::withdraw_fees_handler(ctx, amount)
    }

    pub fn revoke_event(ctx: Context<RevokeEvent>) -> Result<()> {
        instructions::revoke_event::revoke_event_handler(ctx)
    }

    pub fn increase_deadline(
        ctx: Context<IncreaseDeadline>,
        new_deadline: i64,
    ) -> Result<()> {
        instructions::increase_deadline::increase_deadline_handler(ctx, new_deadline)
    }

    pub fn update_fee_percentage(
        ctx: Context<UpdateFeePercentage>,
        new_fee_percentage: u64,
    ) -> Result<()> {
        instructions::update_fee_percentage::update_fee_percentage_handler(ctx, new_fee_percentage)
    }

    pub fn add_voucher_funds(ctx: Context<AddVoucherFunds>, amount: u64) -> Result<()> {
        instructions::add_voucher_funds::add_voucher_funds_handler(ctx, amount)
    }

    pub fn initialize_user_bet(ctx: Context<InitializeUserBet>) -> Result<()> {
        instructions::initialize_user_bet::initialize_user_bet_handler(ctx)
    }

    pub fn update_signer(
        ctx: Context<UpdateSigner>,
        new_signer: Pubkey,
    ) -> Result<()> {
        instructions::update_signer::update_signer_handler(ctx, new_signer)
    }

    pub fn update_owner(
        ctx: Context<UpdateOwner>,
        new_owner: Pubkey,
    ) -> Result<()> {
        instructions::update_owner::update_owner_handler(ctx, new_owner)
    }

    pub fn initialize_event_pool(ctx: Context<InitializeEventPool>) -> Result<()> {
        instructions::initialize_event_pool::initialize_event_pool_handler(ctx)
    }
}