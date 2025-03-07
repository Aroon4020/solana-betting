use anchor_lang::prelude::*;
use crate::{state::*, error::EventBettingProtocolError, constants::USER_BET_SEED};

#[derive(Accounts)]
pub struct CloseUserBet<'info> {
    #[account(mut, close = user, seeds = [USER_BET_SEED, user.key().as_ref(), &event.id.to_le_bytes()], bump)]
    pub user_bet: Account<'info, UserBet>,
    pub event: Account<'info, Event>,
    #[account(mut)]
    pub user: Signer<'info>,
}

pub fn close_user_bet_handler(ctx: Context<CloseUserBet>) -> Result<()> {
    let event = &ctx.accounts.event;
    let user_bet = &ctx.accounts.user_bet;
    // Allow closing only if the event has been resolved.
    require!(event.resolved, EventBettingProtocolError::EventNotResolvedYet);
    // Allow closing only if there is no unclaimed bet amount.
    require!(user_bet.amount == 0, EventBettingProtocolError::InvalidOutcome);
    Ok(())
}
