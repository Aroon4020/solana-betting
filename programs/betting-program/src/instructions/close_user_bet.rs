//! Handler for closing a user bet account and reclaiming the rent SOL.
//!
//! This instruction allows a user to close their bet account after winnings have been claimed
//! (or after they've lost) and reclaim the rent SOL. The actual closing is handled by Anchor
//! through the `close = user` constraint in the account validation struct.

use anchor_lang::prelude::*;
use crate::{state::*, error::EventBettingProtocolError, constants::*};

#[derive(Accounts)]
pub struct CloseUserBet<'info> {
    // The user bet account that will be closed.
    // The `close = user` attribute indicates that this account will be closed
    // and its lamports (rent) will be sent to the user account.
    #[account(
        mut, 
        close = user, // This is where the actual account closing happens
        seeds = [USER_BET_SEED, user.key().as_ref(), &event.id.to_le_bytes()], 
        bump
    )]
    pub user_bet: Account<'info, UserBet>,
    
    // The event account is required to verify that the event has been resolved.
    #[account(
        seeds = [EVENT_SEED, &event.id.to_le_bytes()], 
        bump,
        constraint = event.resolved @ EventBettingProtocolError::EventStillActive
    )]
    pub event: Account<'info, Event>,
    
    // The user account which will receive the rent SOL from the closed account.
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

/// Verifies the user bet account can be closed (zero balance) and emits an event.
/// 
/// The actual closing of the account and transferring rent to the user is handled
/// by Anchor through the `close = user` constraint in the account struct above.
pub fn close_user_bet_handler(ctx: Context<CloseUserBet>) -> Result<()> {
    // Verify that the bet amount is zero, meaning winnings have been claimed
    // or the bet was lost (and the event has been resolved).
    require!(
        ctx.accounts.user_bet.amount == 0, 
        EventBettingProtocolError::BettingClosed
    );

    // Emit an event for off-chain tracking of closed accounts.
    emit!(UserBetClosed {
        event_id: ctx.accounts.event.id,
        user: ctx.accounts.user.key(),
    });

    // Note: The actual account closing happens automatically due to the
    // `close = user` attribute in the CloseUserBet struct above.
    Ok(())
}

#[event]
pub struct UserBetClosed {
    pub event_id: u64,
    pub user: Pubkey,
}
