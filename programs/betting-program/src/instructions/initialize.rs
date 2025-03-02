use anchor_lang::prelude::*;
use crate::{state::*, constants::*};

#[derive(Accounts)]
#[instruction(fee_percentage: u64, signer: Pubkey)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + ProgramState::LEN,
        seeds = [PROGRAM_AUTHORITY_SEED],
        bump
    )]
    pub program_authority: Account<'info, ProgramState>,

    #[account(
        init,
        payer = owner,
        space = 8 + ProgramState::LEN,
        seeds = [BETTING_STATE_SEED],
        bump
    )]
    pub program_state: Account<'info, ProgramState>,

    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Initialize>, fee_percentage: u64, signer: Pubkey) -> Result<()> {
    ctx.accounts.program_state.set_inner(ProgramState {
        fee_percentage,
        signer,
        owner: ctx.accounts.owner.key(),
        next_event_id: 0,
        accumulated_fees: 0,
        active_vouchers_amount: 0,
    });
    Ok(())
}