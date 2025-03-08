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
        bump
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
    require!(
        ctx.accounts.fee_pool.mint == ctx.accounts.program_state.token_mint,
        EventBettingProtocolError::InvalidFeePoolATA
    );
    require!(
        ctx.accounts.event_pool.mint == ctx.accounts.program_state.token_mint,
        EventBettingProtocolError::InvalidEventPoolATA
    );

    let program_state = &mut ctx.accounts.program_state;

    require!(
        program_state.owner == ctx.accounts.owner.key(),
        EventBettingProtocolError::Unauthorized
    );

    let (expected_fee_pool, _bump) = Pubkey::find_program_address(&[BETTING_STATE_SEED, FEE_POOL_SEED], ctx.program_id);
    require!(
        ctx.accounts.fee_pool.key() == expected_fee_pool,
        EventBettingProtocolError::InvalidFeePoolATA
    );

    let (expected_event_pool, _bump) = Pubkey::find_program_address(&[EVENT_SEED, &ctx.accounts.event.id.to_le_bytes(), b"pool"], ctx.program_id);
    require!(
        ctx.accounts.event_pool.key() == expected_event_pool,
        EventBettingProtocolError::InvalidEventPoolATA
    );

    let event = &mut ctx.accounts.event;
    let fee_pool = &ctx.accounts.fee_pool;
    let token_program = &ctx.accounts.token_program;
    let current_time: u64 = Clock::get()?.unix_timestamp.try_into().unwrap();

    require!(current_time >= event.deadline, EventBettingProtocolError::EventStillActive);
    require!(!event.resolved, EventBettingProtocolError::EventAlreadyResolved);

    require!(
        event.outcomes.contains(&winning_outcome),
        EventBettingProtocolError::InvalidWinningOutcome
    );
    let winning_index = event.outcomes.iter().position(|x| x == &winning_outcome).unwrap();

    if event.total_bets_by_outcome[winning_index] == 0 {
        program_state.accumulated_fees = program_state.accumulated_fees
            .checked_add(event.total_pool)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

        token::transfer(
            CpiContext::new_with_signer(
                token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.event_pool.to_account_info(),
                    to: fee_pool.to_account_info(),
                    authority: event.to_account_info(),
                },
                &[&[EVENT_SEED, &event.id.to_le_bytes(), &[ctx.bumps.event]]],
            ),
            event.total_pool,
        )?;
        event.total_pool = 0;
    } else {
        let total_event_pool = token::accessor::amount(&ctx.accounts.event_pool.to_account_info())?;
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
                        from: ctx.accounts.event_pool.to_account_info(),
                        to: fee_pool.to_account_info(),
                        authority: event.to_account_info(),
                    },
                    &[&[EVENT_SEED, &event.id.to_le_bytes(), &[ctx.bumps.event]]],
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
    program_state.active_vouchers_amount = program_state.active_vouchers_amount
        .checked_sub(unclaimed_vouchers)
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

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
