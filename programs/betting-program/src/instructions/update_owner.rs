use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::EventBettingProtocolError;

#[derive(Accounts)]
pub struct UpdateOwner<'info> {
    #[account(mut, has_one = owner @ EventBettingProtocolError::Unauthorized)]
    pub program_state: Account<'info, ProgramState>,
    #[account(mut)]
    pub owner: Signer<'info>, // Mark owner as mut for consistency
}

pub fn update_owner_handler(
    ctx: Context<UpdateOwner>,
    new_owner: Pubkey,
) -> Result<()> {
    ctx.accounts.program_state.owner = new_owner;
    Ok(())
}