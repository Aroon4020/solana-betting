use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use solana_program::account_info::AccountInfo;
use solana_program::sysvar::clock::Clock;
use crate::{state::*, constants::*, error::EventBettingProtocolError};
use crate::utils::outcome_hasher::hash_outcome;
use std::convert::TryInto;

#[derive(Accounts)]
pub struct PlaceBetWithVoucher<'info> {
    #[account(
        mut,
        seeds = [BETTING_STATE_SEED],
        bump
    )]
    pub program_state: Account<'info, ProgramState>,

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
    let event = &mut ctx.accounts.event;
    let user_bet = &mut ctx.accounts.user_bet;

    // Initial validations
    if vouched_amount > 0 {
        require!(
            ctx.accounts.admin_signer.is_some(),
            EventBettingProtocolError::InvalidSignature
        );
    }

    require!(vouched_amount > 0, EventBettingProtocolError::VouchedAmountZero);
    require!(
        vouched_amount <= event
            .voucher_amount
            .checked_sub(event.total_voucher_claimed)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?,
        EventBettingProtocolError::VoucherAmountExceedsLimit
    );
    require!(nonce == user_bet.nonce, EventBettingProtocolError::InvalidNonce);

    // Time validation
    let clock = Clock::get()?;
    let current_time: u64 = clock.unix_timestamp.try_into().unwrap();
    require!(
        current_time >= event.start_time,
        EventBettingProtocolError::BettingNotStarted
    );
    require!(
        current_time < event.deadline,
        EventBettingProtocolError::BettingClosed
    );

    // Handle token transfers
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

    // Transfer vouched amount from fee pool
    let seeds = &[BETTING_STATE_SEED, &[ctx.bumps.program_state]];
    let signer = &[&seeds[..]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.fee_pool.to_account_info(),
                to: ctx.accounts.event_pool.to_account_info(),
                authority: ctx.accounts.program_state.to_account_info(),
            },
            signer,
        ),
        vouched_amount,
    )?;

    // Update program state
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

    // Update event state
    event.total_voucher_claimed = event
        .total_voucher_claimed
        .checked_add(vouched_amount)
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

    let outcome_hash = hash_outcome(&outcome);
    let outcome_index = event
        .outcomes
        .iter()
        .position(|x| *x == outcome_hash)
        .ok_or(EventBettingProtocolError::InvalidOutcome)?;

    let total_bet = amount
        .checked_add(vouched_amount)
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

    event.total_bets_by_outcome[outcome_index] = event
        .total_bets_by_outcome[outcome_index]
        .checked_add(total_bet)
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

    event.total_pool = event
        .total_pool
        .checked_add(total_bet)
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

    // Update user bet
    if user_bet.outcome == [0u8; 32] {
        user_bet.outcome = outcome_hash;
    } else {
        require!(
            user_bet.outcome == outcome_hash,
            EventBettingProtocolError::InvalidOutcome
        );
    }

    user_bet.amount = user_bet
        .amount
        .checked_add(total_bet)
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

    user_bet.nonce = nonce
        .checked_add(1)
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

    // Emit events
    emit!(BetPlaced {
        event_id: event.id,
        user: ctx.accounts.user.key(),
        amount: total_bet,
        outcome: outcome.clone(),
    });

    emit!(VoucherClaimed {
        event_id: event.id,
        user: ctx.accounts.user.key(),
        vouched_amount,
        nonce,
    });

    Ok(())
}

#[event]
pub struct BetPlaced {
    pub event_id: u64,
    pub user: Pubkey,
    pub amount: u64,
    pub outcome: String,
}

#[event]
pub struct VoucherClaimed {
    pub event_id: u64,
    pub user: Pubkey,
    pub vouched_amount: u64,
    pub nonce: u64,
}