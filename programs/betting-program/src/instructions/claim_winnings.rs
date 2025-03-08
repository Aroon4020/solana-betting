use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use anchor_spl::associated_token::get_associated_token_address;
use crate::{state::*, constants::*, error::EventBettingProtocolError};

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    // Remove 'mut' since we don't modify the user account data
    #[account(signer)]
    pub user: Signer<'info>,

    // Add program_state to the context and properly validate token mint
    #[account(seeds = [BETTING_STATE_SEED], bump)]
    pub program_state: Account<'info, ProgramState>,

    #[account(mut, token::mint = program_state.token_mint)]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut, seeds = [EVENT_SEED, &event.id.to_le_bytes()], bump)]
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
    // Verify user's ATA with proper mint validation
    let expected_ata = get_associated_token_address(&ctx.accounts.user.key(), &ctx.accounts.program_state.token_mint);
    require!(
        *ctx.accounts.user_token_account.to_account_info().key == expected_ata,
        EventBettingProtocolError::InvalidUserATA
    );

    let event = &mut ctx.accounts.event;
    let user_bet = &mut ctx.accounts.user_bet;

    let winning = event.winning_outcome.clone().ok_or(EventBettingProtocolError::EventNotResolvedYet)?;
    require!(winning == user_bet.outcome, EventBettingProtocolError::InvalidOutcome);
    require!(user_bet.amount > 0, EventBettingProtocolError::NoWinningsToClaim);

    let win_idx = event.outcomes.iter().position(|opt| *opt == winning)
        .ok_or(EventBettingProtocolError::InvalidOutcome)?;
    let total_winning_bets = event.total_bets_by_outcome[win_idx];
    require!(total_winning_bets > 0, EventBettingProtocolError::ArithmeticOverflow);

    let payout = event.total_pool
        .checked_mul(user_bet.amount)
        .and_then(|v| v.checked_div(total_winning_bets))
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

    let event_id = ctx.accounts.event.id;
    let event_bump = ctx.bumps.event;
    let seeds = &[EVENT_SEED, &event_id.to_le_bytes(), &[event_bump]];
    let event_info = ctx.accounts.event.to_account_info();
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.event_pool.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: event_info,
            },
            &[seeds],
        ),
        payout,
    )?;

    user_bet.amount = 0;

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
