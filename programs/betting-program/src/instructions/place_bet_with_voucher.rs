use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer}; // Import token module
use solana_program::account_info::AccountInfo;
use solana_program::sysvar::clock::Clock;
use crate::{state::*, constants::*, error::EventBettingProtocolError};

#[derive(Accounts)]
pub struct PlaceBetWithVoucher<'info> {
    #[account(mut)]
    pub program_state: Account<'info, ProgramState>,

    // Retain admin_signer only for the voucher check.
    #[account(address = program_state.signer)]
    pub admin_signer: Option<Signer<'info>>,

    #[account(mut, seeds = [EVENT_SEED, &event.id.to_le_bytes()], bump)]
    pub event: Account<'info, Event>,

    #[account(mut, seeds = [USER_BET_SEED, user.key().as_ref(), &event.id.to_le_bytes()], bump)]
    pub user_bet: Account<'info, UserBet>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut, seeds = [EVENT_SEED, &event.id.to_le_bytes(), b"pool"], bump)]
    pub event_pool: Account<'info, TokenAccount>,

    #[account(mut, seeds = [BETTING_STATE_SEED, FEE_POOL_SEED], bump)]
    pub fee_pool: Account<'info, TokenAccount>,
    #[account(
        seeds = [PROGRAM_AUTHORITY_SEED],
        bump // Assuming PROGRAM_AUTHORITY_SEED is defined
    )]
    /// CHECK: Program authority is derived via seeds and validated in the program.
    /// No need to deserialize and check account data, only account info is needed for CPI.
    pub program_authority: AccountInfo<'info>,

    #[account(signer)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn place_bet_with_voucher_handler(
    ctx: Context<PlaceBetWithVoucher>,
    outcome: String,
    amount: u64,
    vouched_amount: u64,
    nonce: u64,
) -> Result<()> {
    if vouched_amount > 0 {
        require!(
            ctx.accounts.admin_signer.is_some(),
            EventBettingProtocolError::InvalidSignature
        );
    }
    // Get current time
    let clock = Clock::get()?;
    let event = &mut ctx.accounts.event;
    let user_bet = &mut ctx.accounts.user_bet;
    require!(vouched_amount > 0, EventBettingProtocolError::VouchedAmountZero);
    require!(
        vouched_amount <= event
            .voucher_amount
            .checked_sub(event.total_voucher_claimed)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?,
        EventBettingProtocolError::VoucherAmountExceedsLimit
    );
    require!(nonce == user_bet.nonce, EventBettingProtocolError::InvalidNonce);
    require!(
        clock.unix_timestamp < event.deadline,
        EventBettingProtocolError::BettingClosed
    );

    if amount > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.event_pool.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
        )?;
    }
    let seeds = &[PROGRAM_AUTHORITY_SEED, &[ctx.bumps.program_authority]];
    let signer = &[&seeds[..]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.fee_pool.to_account_info(),
                to: ctx.accounts.event_pool.to_account_info(),
                authority: ctx.accounts.program_authority.to_account_info(),
            },
            signer,
        ),
        vouched_amount,
    )?;

    // Update state
    ctx.accounts.program_state.accumulated_fees = ctx
        .accounts
        .program_state
        .accumulated_fees
        .checked_sub(vouched_amount)
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
    ctx.accounts.program_state.active_vouchers_amount = ctx
        .accounts
        .program_state
        .active_vouchers_amount
        .checked_sub(vouched_amount)
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
    event.total_voucher_claimed = event.total_voucher_claimed.checked_add(vouched_amount).unwrap();
    let outcome_index = event
        .possible_outcomes
        .iter()
        .position(|x| x == &outcome)
        .ok_or(EventBettingProtocolError::InvalidOutcome)?;
    let total_bet = amount
        .checked_add(vouched_amount)
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
    event.total_bets_by_outcome[outcome_index] = event
        .total_bets_by_outcome[outcome_index]
        .checked_add(total_bet)
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
    event.total_pool = event.total_pool.checked_add(total_bet).unwrap();
    if user_bet.outcome.is_empty() {
        user_bet.outcome = outcome;
    } else {
        require!(
            user_bet.outcome == outcome,
            EventBettingProtocolError::InvalidOutcome
        );
    }
    user_bet.amount = user_bet.amount.checked_add(total_bet).unwrap();
    user_bet.nonce = nonce.checked_add(1).unwrap();

    Ok(())
}