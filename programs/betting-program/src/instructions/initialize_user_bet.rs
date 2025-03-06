use anchor_lang::prelude::*;
use crate::state::*;
use crate::constants::*;

#[derive(Accounts)]
pub struct InitializeUserBet<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + UserBet::LEN, // Use UserBet::LEN
        seeds = [
            USER_BET_SEED,
            user.key().as_ref(),
            &event.id.to_le_bytes()
        ],
        bump
    )]
    pub user_bet: Account<'info, UserBet>,
    #[account(mut)]
    pub event: Account<'info, Event>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_user_bet_handler(ctx: Context<InitializeUserBet>) -> Result<()> {
    let user_bet = &mut ctx.accounts.user_bet;
    user_bet.user = ctx.accounts.user.key();
    user_bet.event_id = ctx.accounts.event.id;
    // Initialize outcome to a default hash (zeroed)
    user_bet.outcome = [0u8; 32];
    user_bet.amount = 0;
    user_bet.nonce = 0;
    Ok(())
}