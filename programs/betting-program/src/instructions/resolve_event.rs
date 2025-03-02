use anchor_lang::prelude::*;
use anchor_spl::token::{self, accessor, Token, TokenAccount, Mint, Transfer};
use solana_program::account_info::AccountInfo;
use solana_program::sysvar::clock::Clock;
use crate::state::*;
use crate::constants::*;
use crate::error::EventBettingProtocolError;

#[derive(Accounts)]
pub struct ResolveEvent<'info> {
    #[account(mut)]
    pub program_state: Account<'info, ProgramState>,

    #[account(mut, seeds = [EVENT_SEED, &event.id.to_le_bytes()], bump)]
    pub event: Account<'info, Event>,

    #[account(
        seeds = [PROGRAM_AUTHORITY_SEED],
        bump
    )]
    /// CHECK: This PDA is derived from PROGRAM_AUTHORITY_SEED and is used solely for signing CPI calls.
    pub program_authority: AccountInfo<'info>,

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

    // Security checks
    require!(
        program_state.owner == ctx.accounts.owner.key(),
        EventBettingProtocolError::Unauthorized
    );
    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp >= event.deadline,
        EventBettingProtocolError::EventStillActive
    );
    require!(
        !event.resolved,
        EventBettingProtocolError::EventAlreadyResolved
    );

    // Validate winning outcome index (unused; prefix with underscore)
    let _winning_index = event
        .possible_outcomes
        .iter()
        .position(|x| x == &winning_outcome)
        .ok_or(EventBettingProtocolError::InvalidWinningOutcome)?;

    // Calculate fee from pool
    let total_event_pool =
        token::accessor::amount(&ctx.accounts.event_pool.to_account_info())?;
    let fee = (total_event_pool as u128)
        .checked_mul(program_state.fee_percentage as u128)
        .unwrap()
        .checked_div(10000)
        .unwrap() as u64;

    // Mark event as resolved
    event.resolved = true;
    event.winning_outcome = Some(winning_outcome);

    // Derive signer seeds for the event PDA used in token transfer
    let event_seeds = &[
        EVENT_SEED,
        &event.id.to_le_bytes(),
        &[ctx.bumps.event],
    ];
    let signer = &[&event_seeds[..]];

    // Transfer fee from event pool to fee pool
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

    // Update state values
    program_state.accumulated_fees = program_state.accumulated_fees.checked_add(fee).unwrap();

    event.total_pool = event
        .total_pool
        .checked_sub(fee)
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

    Ok(())
}