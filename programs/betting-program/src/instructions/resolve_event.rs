use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};
use solana_program::account_info::AccountInfo;
use solana_program::sysvar::clock::Clock;
use crate::state::*;
use crate::constants::*;
use crate::error::EventBettingProtocolError;
use crate::utils::outcome_hasher::hash_outcome;
use std::convert::TryInto;

#[derive(Accounts)]
pub struct ResolveEvent<'info> {
    #[account(
        mut,
        seeds = [BETTING_STATE_SEED],
        bump
    )]
    pub program_state: Account<'info, ProgramState>,

    #[account(mut, seeds = [EVENT_SEED, &event.id.to_le_bytes()], bump)]
    pub event: Account<'info, Event>,

    #[account(
        mut,
        seeds = [EVENT_SEED, &event.id.to_le_bytes(), b"pool"],
        bump,
        token::mint = token_mint.key(),
        token::authority = event,
    )]
    pub event_pool: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [BETTING_STATE_SEED, FEE_POOL_SEED],
        bump,
        token::mint = token_mint.key(),
    )]
    pub fee_pool: Account<'info, TokenAccount>,

    pub token_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,

    #[account(mut)]
    pub owner: Signer<'info>,
}

pub fn resolve_event_handler(ctx: Context<ResolveEvent>, winning_outcome: String) -> Result<()> {
    let event = &mut ctx.accounts.event;
    let fee_pool = &ctx.accounts.fee_pool;
    let token_program = &ctx.accounts.token_program;
    let program_state = &mut ctx.accounts.program_state;
    let clock = Clock::get()?;
    // Convert clock.unix_timestamp to u64
    let current_time: u64 = clock.unix_timestamp.try_into().unwrap();

    // Security checks
    require!(
        program_state.owner == ctx.accounts.owner.key(),
        EventBettingProtocolError::Unauthorized
    );
    require!(
        current_time >= event.deadline,
        EventBettingProtocolError::EventStillActive
    );
    require!(
        !event.resolved,
        EventBettingProtocolError::EventAlreadyResolved
    );

    // Convert winning outcome to hash
    let winning_hash = hash_outcome(&winning_outcome);

    // Validate winning outcome hash
    require!(
        event.outcomes.contains(&winning_hash),
        EventBettingProtocolError::InvalidWinningOutcome
    );

    // Handle zero winning outcome case
    let winning_index = event
        .outcomes
        .iter()
        .position(|x| x == &winning_hash)
        .ok_or(EventBettingProtocolError::InvalidWinningOutcome)?;

    if event.total_bets_by_outcome[winning_index] == 0 {
        program_state.accumulated_fees = program_state.accumulated_fees
            .checked_add(event.total_pool)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
        
        // Transfer all funds to fee pool
        let event_seeds = &[
            EVENT_SEED,
            &event.id.to_le_bytes(),
            &[ctx.bumps.event],
        ];
        let signer = &[&event_seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.event_pool.to_account_info(),
                    to: fee_pool.to_account_info(),
                    authority: event.to_account_info(),
                },
                signer,
            ),
            event.total_pool,
        )?;

        event.total_pool = 0;
    } else {
        // Calculate and transfer fee
        let total_event_pool = token::accessor::amount(&ctx.accounts.event_pool.to_account_info())?;
        let fee = (total_event_pool as u128)
            .checked_mul(program_state.fee_percentage as u128)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?
            .checked_div(10000)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)? as u64;

        if fee > 0 {
            let event_seeds = &[
                EVENT_SEED,
                &event.id.to_le_bytes(),
                &[ctx.bumps.event],
            ];
            let signer = &[&event_seeds[..]];

            token::transfer(
                CpiContext::new_with_signer(
                    token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.event_pool.to_account_info(),
                        to: fee_pool.to_account_info(),
                        authority: event.to_account_info(),
                    },
                    signer,
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

    // Update voucher amounts
    let unclaimed_vouchers = event.voucher_amount
        .checked_sub(event.total_voucher_claimed)
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
        
    program_state.active_vouchers_amount = program_state
        .active_vouchers_amount
        .checked_sub(unclaimed_vouchers)
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

    // Mark event as resolved
    event.resolved = true;
    event.winning_outcome = Some(winning_hash);

    // Emit event
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