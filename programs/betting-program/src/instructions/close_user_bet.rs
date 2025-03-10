use anchor_lang::prelude::*;
use crate::{state::*, error::EventBettingProtocolError, constants::*};

#[derive(Accounts)]
pub struct CloseUserBet<'info> {
    #[account(
        mut, 
        close = user, 
        seeds = [USER_BET_SEED, user.key().as_ref(), &event.id.to_le_bytes()], 
        bump
    )]
    pub user_bet: Account<'info, UserBet>,
    
    #[account(
        seeds = [EVENT_SEED, &event.id.to_le_bytes()], 
        bump,
        constraint = event.resolved @ EventBettingProtocolError::EventStillActive
    )]
    pub event: Account<'info, Event>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn close_user_bet_handler(ctx: Context<CloseUserBet>) -> Result<()> {
    require!(
        ctx.accounts.user_bet.amount == 0, 
        EventBettingProtocolError::BettingClosed
    );
    emit!(UserBetClosed {
        event_id: ctx.accounts.event.id,
        user: ctx.accounts.user.key(),
    });
    Ok(())
}

#[event]
pub struct UserBetClosed {
    pub event_id: u64,
    pub user: Pubkey,
}
