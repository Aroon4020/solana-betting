use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer}; // Import token module
use crate::{state::*, constants::*, error::EventBettingProtocolError};

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    #[account(mut, seeds = [EVENT_SEED, &event.id.to_le_bytes()], bump)] // <--- Define event as PDA
    pub event: Account<'info, Event>,
    #[account(
        mut,
        seeds = [USER_BET_SEED, user.key().as_ref(), &event.id.to_le_bytes()], // Corrected seed
        has_one = user, // Important: Add the has_one constraint
        bump
    )]
    pub user_bet: Account<'info, UserBet>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [EVENT_SEED, &event.id.to_le_bytes(), b"pool"],
        bump,
        token::mint = user_token_account.mint, // Add mint constraint
        token::authority = event                // Authority is the event account
    )]
    pub event_pool: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn claim_winnings_handler(ctx: Context<ClaimWinnings>) -> Result<()> {
    let event = &mut ctx.accounts.event;
    let user_bet = &mut ctx.accounts.user_bet;

    // Ensure the event is resolved and the user's outcome matches
    let winning = event
        .winning_outcome
        .as_ref()
        .ok_or(EventBettingProtocolError::EventNotResolvedYet)?;
    require!(winning == &user_bet.outcome, EventBettingProtocolError::InvalidOutcome);
    require!(user_bet.amount > 0, EventBettingProtocolError::NoWinningsToClaim);

    // Compute winning index and ensure valid total winning bets
    let win_idx = event
        .possible_outcomes
        .iter()
        .position(|opt| opt == winning)
        .ok_or(EventBettingProtocolError::InvalidOutcome)?;
    let total_winning_bets = event.total_bets_by_outcome[win_idx];
    require!(
        total_winning_bets > 0,
        EventBettingProtocolError::ArithmeticOverflow
    );

    // Calculate payout based on the user's share of winning bets
    let total_pool_after_fees = event.total_pool;
    let payout = total_pool_after_fees
        .checked_mul(user_bet.amount)
        .and_then(|v| v.checked_div(total_winning_bets))
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

    // Transfer payout tokens from event pool to user's token account
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.event_pool.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.event.to_account_info(),
            },
            &[&[EVENT_SEED, &ctx.accounts.event.id.to_le_bytes(), &[ctx.bumps.event]]],
        ),
        payout,
    )?;

    // Reset user's bet amount after claim
    user_bet.amount = 0;

    Ok(())
}