use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use solana_program::sysvar::clock::Clock;
use crate::state::*;
use crate::constants::*;
use crate::error::EventBettingProtocolError;

#[derive(Accounts)]
pub struct PlaceBet<'info> {
    #[account(mut)]
    pub event: Account<'info, Event>,

    #[account(
        mut,
        seeds = [USER_BET_SEED, user.key().as_ref(), &event.id.to_le_bytes()],
        has_one = user,
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
    pub token_program: Program<'info, Token>,
}

pub fn place_bet_handler(
    ctx: Context<PlaceBet>,
    outcome: String,
    amount: u64,
) -> Result<()> {
    // Define current_time before use.
    let current_time = Clock::get()?.unix_timestamp;
    require!(amount > 0, EventBettingProtocolError::BetAmountZero);
    require!(
        current_time < ctx.accounts.event.deadline,
        EventBettingProtocolError::BettingClosed
    );

    // Lookup outcome index
    let outcome_index = ctx
        .accounts
        .event
        .possible_outcomes
        .iter()
        .position(|opt| opt == &outcome)
        .ok_or(EventBettingProtocolError::InvalidOutcome)?;

    // Update outcome total bets safely
    ctx.accounts.event.total_bets_by_outcome[outcome_index] = ctx
        .accounts
        .event
        .total_bets_by_outcome[outcome_index]
        .checked_add(amount)
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

    // Transfer tokens from user to event pool
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

    // Set user bet outcome if not set; if exists then verify it matches
    if ctx.accounts.user_bet.outcome.is_empty() {
        ctx.accounts.user_bet.outcome = outcome.clone();
    } else {
        require!(
            ctx.accounts.user_bet.outcome == outcome,
            EventBettingProtocolError::InvalidOutcome
        );
    }

    ctx.accounts.user_bet.amount = ctx.accounts.user_bet.amount.checked_add(amount).unwrap();
    ctx.accounts.event.total_pool = ctx.accounts.event.total_pool.checked_add(amount).unwrap();

    Ok(())
}