use anchor_lang::prelude::*;
use crate::{state::ProgramState, error::EventBettingProtocolError, constants::*}; // Add constants import

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut, 
        seeds = [BETTING_STATE_SEED],
        bump,
        has_one = owner @ EventBettingProtocolError::Unauthorized
    )]
    pub program_state: Account<'info, ProgramState>,
    
    // Remove mut as we don't modify the signer
    #[account(signer)]
    pub owner: Signer<'info>,
}

pub fn update_config_handler(
    ctx: Context<UpdateConfig>,
    new_owner: Option<Pubkey>,
    new_signer: Option<Pubkey>,
    new_fee_percentage: Option<u16>,
) -> Result<()> {
    let program_state = &mut ctx.accounts.program_state;

    if let Some(owner) = new_owner {
        program_state.owner = owner;
    }
    if let Some(signer) = new_signer {
        program_state.signer = signer;
    }
    if let Some(fee) = new_fee_percentage {
        // Store fee percentage as u64 in state.
        program_state.fee_percentage = fee as u64;
    }

    emit!(ConfigUpdated {
        new_owner: program_state.owner,
        new_signer: program_state.signer,
        new_fee_percentage: program_state.fee_percentage as u16, // Cast back to u16 for event.
    });

    Ok(())
}

#[event]
pub struct ConfigUpdated {
    pub new_owner: Pubkey,
    pub new_signer: Pubkey,
    pub new_fee_percentage: u16,
}