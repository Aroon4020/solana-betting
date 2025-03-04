use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::EventBettingProtocolError;

#[derive(Accounts)]
pub struct UpdateSigner<'info> {
    #[account(mut, has_one = owner @ EventBettingProtocolError::Unauthorized)]
    pub program_state: Account<'info, ProgramState>,
    #[account(mut)]
    pub owner: Signer<'info>, // Mark owner as mut for consistency
}

pub fn update_signer_handler(
    ctx: Context<UpdateSigner>,
    new_signer: Pubkey,
) -> Result<()> {
    let old_signer = ctx.accounts.program_state.signer;
    ctx.accounts.program_state.signer = new_signer;
    emit!(SignerUpdated {
        old_signer,
        new_signer,
    });
    Ok(())
}

#[event]
pub struct SignerUpdated {
    pub old_signer: Pubkey,
    pub new_signer: Pubkey,
}