use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use anchor_spl::associated_token::get_associated_token_address;
use crate::{state::*, constants::*, error::EventBettingProtocolError};

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    #[account(signer)]
    pub user: Signer<'info>,
    #[account(seeds = [BETTING_STATE_SEED], bump)]
    pub program_state: Account<'info, ProgramState>,

    #[account(mut, token::mint = program_state.token_mint)]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
        seeds = [EVENT_SEED, &event.id.to_le_bytes()], 
        bump,
        constraint = event.resolved @ EventBettingProtocolError::EventStillActive
    )]
    pub event: Account<'info, Event>,

    #[account(
        mut,
        seeds = [USER_BET_SEED, user.key().as_ref(), &event.id.to_le_bytes()],
        bump
    )]
    pub user_bet: Account<'info, UserBet>,

    #[account(
        mut,
        seeds = [EVENT_SEED, &event.id.to_le_bytes(), b"pool"],
        bump,
        token::mint = program_state.token_mint, 
        token::authority = event
    )]
    pub event_pool: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn claim_winnings_handler(ctx: Context<ClaimWinnings>) -> Result<()> {
    let user_bet_amount = ctx.accounts.user_bet.amount;
    let user_bet_outcome = ctx.accounts.user_bet.outcome.clone();
    
    // Keep essential business validations
    let winning = ctx.accounts.event.winning_outcome.clone()
        .ok_or(EventBettingProtocolError::EventStillActive)?;
    
    require!(winning == user_bet_outcome, EventBettingProtocolError::InvalidOutcome);
    
    // Remaining logic
    let expected_ata = get_associated_token_address(&ctx.accounts.user.key(), &ctx.accounts.program_state.token_mint);
    require!(
        *ctx.accounts.user_token_account.to_account_info().key == expected_ata,
        EventBettingProtocolError::InvalidUserATA
    );

    let win_idx = ctx.accounts.event.outcomes.iter().position(|opt| *opt == winning)
        .ok_or(EventBettingProtocolError::InvalidOutcome)?;
    let total_winning_bets = ctx.accounts.event.total_bets_by_outcome[win_idx];
    require!(total_winning_bets > 0, EventBettingProtocolError::BettingClosed);

    let payout = ctx.accounts.event.total_pool
        .checked_mul(user_bet_amount)
        .and_then(|v| v.checked_div(total_winning_bets))
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
    
    let event_id = ctx.accounts.event.id;
    let event_bump = ctx.bumps.event;
    let seeds = &[EVENT_SEED, &event_id.to_le_bytes(), &[event_bump]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.event_pool.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.event.to_account_info(),
            },
            &[seeds],
        ),
        payout,
    )?;

    ctx.accounts.user_bet.amount = 0;

    emit!(WinningsClaimed {
        event_id,
        user: ctx.accounts.user.key(),
        payout,
    });
    Ok(())
}

#[event]
pub struct WinningsClaimed {
    pub event_id: u64,
    pub user: Pubkey,
    pub payout: u64,
}
