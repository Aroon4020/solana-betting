use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::EventBettingProtocolError;

#[derive(Accounts)]
pub struct UpdateFeePercentage<'info> {
    #[account(mut, has_one = owner @ EventBettingProtocolError::Unauthorized)]
    pub program_state: Account<'info, ProgramState>,
    #[account(mut)]
    pub owner: Signer<'info>, // Mark owner as mut for consistency
}

pub fn update_fee_percentage_handler(
    ctx: Context<UpdateFeePercentage>,
    new_fee_percentage: u64,
) -> Result<()> {
    ctx.accounts.program_state.fee_percentage = new_fee_percentage;
    Ok(())
}