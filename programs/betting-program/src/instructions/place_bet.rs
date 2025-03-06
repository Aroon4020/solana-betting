use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use solana_program::sysvar::clock::Clock;
use crate::{state::*, constants::*, error::EventBettingProtocolError};
use crate::utils::outcome_hasher::hash_outcome;

#[derive(Accounts)]
#[instruction(outcome: String, amount: u64)]
pub struct PlaceBet<'info> {
    #[account(mut)]
    pub event: Account<'info, Event>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserBet::LEN,
        seeds = [USER_BET_SEED, user.key().as_ref(), &event.id.to_le_bytes()],
        bump
    )]
    pub user_bet: Account<'info, UserBet>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [EVENT_SEED, &event.id.to_le_bytes(), b"pool"],
        bump,
        token::mint = user_token_account.mint,
        token::authority = event
    )]
    pub event_pool: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn place_bet_handler(ctx: Context<PlaceBet>, outcome: String, amount: u64) -> Result<()> {
    let event = &mut ctx.accounts.event;
    let outcome_hash = hash_outcome(&outcome);
    
    require!(amount > 0, EventBettingProtocolError::BetAmountZero);
    let clock = Clock::get()?;
    require!((clock.unix_timestamp as u64) >= event.start_time, EventBettingProtocolError::BettingNotStarted);
    require!((clock.unix_timestamp as u64) < event.deadline, EventBettingProtocolError::BettingClosed);

    let outcome_index = event.outcomes.iter().position(|opt| *opt == outcome_hash)
        .ok_or(EventBettingProtocolError::InvalidOutcome)?;
    event.total_bets_by_outcome[outcome_index] = event.total_bets_by_outcome[outcome_index]
        .checked_add(amount)
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

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

    if ctx.accounts.user_bet.outcome == [0u8; 32] {
        ctx.accounts.user_bet.outcome = outcome_hash;
    } else {
        require!(ctx.accounts.user_bet.outcome == outcome_hash, EventBettingProtocolError::InvalidOutcome);
    }

    ctx.accounts.user_bet.amount = ctx.accounts.user_bet.amount
        .checked_add(amount)
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

    event.total_pool = event.total_pool
        .checked_add(amount)
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

    emit!(BetPlaced {
        event_id: event.id,
        user: ctx.accounts.user.key(),
        amount,
        outcome: outcome_hash,
    });

    Ok(())
}

#[event]
pub struct BetPlaced {
    pub event_id: u64,
    pub user: Pubkey,
    pub amount: u64,
    pub outcome: [u8; 32],
}