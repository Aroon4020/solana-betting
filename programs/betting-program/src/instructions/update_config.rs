use anchor_lang::prelude::*;
use crate::{state::ProgramState, error::EventBettingProtocolError};

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(mut, has_one = owner @ EventBettingProtocolError::Unauthorized)]
    pub program_state: Account<'info, ProgramState>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

pub fn update_config_handler(
    ctx: Context<UpdateConfig>,
    new_owner: Option<Pubkey>,
    new_signer: Option<Pubkey>,
    new_fee_percentage: Option<u16>,
) -> Result<()> {
    let ps = &mut ctx.accounts.program_state;
    if let Some(owner) = new_owner {
        ps.owner = owner;
    }
    if let Some(signer) = new_signer {
        ps.signer = signer;
    }
    if let Some(fee) = new_fee_percentage {
        // Convert the fee into u64 to store in state.
        ps.fee_percentage = fee as u64;
    }
    emit!(ConfigUpdated {
        new_owner: ps.owner,
        new_signer: ps.signer,
        new_fee_percentage: ps.fee_percentage as u16, // Cast back to u16 for the event.
    });
    Ok(())
}

#[event]
pub struct ConfigUpdated {
    pub new_owner: Pubkey,
    pub new_signer: Pubkey,
    pub new_fee_percentage: u16,
}
