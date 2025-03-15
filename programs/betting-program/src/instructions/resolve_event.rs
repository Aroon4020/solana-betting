use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use solana_program::sysvar::clock::Clock;
use std::convert::TryInto;
use crate::{state::*, constants::*, error::EventBettingProtocolError};
use solana_program::pubkey::Pubkey;

#[derive(Accounts)]
pub struct ResolveEvent<'info> {
    #[account(
        mut,
        seeds = [BETTING_STATE_SEED],
        bump,
        has_one = owner @ EventBettingProtocolError::Unauthorized  // Validate owner at accounts level
    )]
    pub program_state: Account<'info, ProgramState>,

    #[account(mut, seeds = [EVENT_SEED, &event.id.to_le_bytes()], bump)]
    pub event: Account<'info, Event>,

    #[account(
        mut,
        seeds = [EVENT_SEED, &event.id.to_le_bytes(), b"pool"],
        bump,
        token::mint = program_state.token_mint,
        token::authority = event,
    )]
    pub event_pool: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [BETTING_STATE_SEED, FEE_POOL_SEED],
        bump,
        token::mint = program_state.token_mint,
    )]
    pub fee_pool: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,

    #[account(signer)]
    pub owner: Signer<'info>,
}

pub fn resolve_event_handler(ctx: Context<ResolveEvent>, winning_outcome: String) -> Result<()> {
    // Validate time, resolution status, and winning outcome first
    let current_time: u64 = Clock::get()?.unix_timestamp.try_into().unwrap();
    require!(current_time >= ctx.accounts.event.deadline, EventBettingProtocolError::EventStillActive);
    require!(!ctx.accounts.event.resolved, EventBettingProtocolError::EventAlreadyResolved);
    require!(
        ctx.accounts.event.outcomes.contains(&winning_outcome),
        EventBettingProtocolError::InvalidWinningOutcome
    );

    // Find the index of the winning outcome before borrowing mutably
    let winning_index = ctx.accounts.event.outcomes
        .iter()
        .position(|o| o == &winning_outcome)
        .ok_or(EventBettingProtocolError::InvalidWinningOutcome)?;

    // Get token information we need before mutable borrows
    let token_program = &ctx.accounts.token_program;
    let fee_pool_info = &ctx.accounts.fee_pool.to_account_info();
    let event_pool_info = &ctx.accounts.event_pool.to_account_info();
    let event_bump = ctx.bumps.event;
    let event_id = ctx.accounts.event.id;

    // Now we can borrow mutably
    let event = &mut ctx.accounts.event;
    let program_state = &mut ctx.accounts.program_state;

    // Zero winners case
    if event.total_bets_by_outcome[winning_index] == 0 {
        program_state.accumulated_fees = program_state.accumulated_fees
            .checked_add(event.total_pool)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

        token::transfer(
            CpiContext::new_with_signer(
                token_program.to_account_info(),
                Transfer {
                    from: event_pool_info.clone(),
                    to: fee_pool_info.clone(),
                    authority: event.to_account_info(),
                },
                &[&[EVENT_SEED, &event_id.to_le_bytes(), &[event_bump]]],
            ),
            event.total_pool,
        )?;
        event.total_pool = 0;
    } else {
        let total_event_pool = token::accessor::amount(&event_pool_info)?;
        let fee = (total_event_pool as u128)
            .checked_mul(program_state.fee_percentage as u128)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?
            .checked_div(10000)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)? as u64;
        
        if fee > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    token_program.to_account_info(),
                    Transfer {
                        from: event_pool_info.clone(),
                        to: fee_pool_info.clone(),
                        authority: event.to_account_info(),
                    },
                    &[&[EVENT_SEED, &event_id.to_le_bytes(), &[event_bump]]],
                ),
                fee,
            )?;

            program_state.accumulated_fees = program_state.accumulated_fees
                .checked_add(fee)
                .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
            event.total_pool = event.total_pool
                .checked_sub(fee)
                .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
        }
    }

    let unclaimed_vouchers = event.voucher_amount
        .checked_sub(event.total_voucher_claimed)
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

    if unclaimed_vouchers > 0 {
        program_state.active_vouchers_amount = program_state.active_vouchers_amount
            .checked_sub(unclaimed_vouchers)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
    }

    event.resolved = true;
    event.winning_outcome = Some(winning_outcome.clone());

    emit!(EventResolved {
        event_id: event.id,
        winning_outcome: winning_outcome.clone(),
        total_pool: event.total_pool,
    });

    Ok(())
}

#[event]
pub struct EventResolved {
    pub event_id: u64,
    pub winning_outcome: String,
    pub total_pool: u64,
}