use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};
use crate::{state::*, constants::*};

#[derive(Accounts)]
#[instruction(fee_percentage: u64, signer: Pubkey, token_mint: Pubkey)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + ProgramState::LEN,
        seeds = [BETTING_STATE_SEED],
        bump
    )]
    pub program_state: Account<'info, ProgramState>,

    #[account(
        init,
        payer = owner,
        seeds = [BETTING_STATE_SEED, FEE_POOL_SEED],
        bump,
        token::mint = token_mint,
        token::authority = program_state
    )]
    pub fee_pool: Account<'info, TokenAccount>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub token_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<Initialize>,
    fee_percentage: u64,
    signer: Pubkey,
    token_mint: Pubkey
) -> Result<()> {
    ctx.accounts.program_state.set_inner(ProgramState {
        fee_percentage,
        signer,
        owner: ctx.accounts.owner.key(),
        next_event_id: 0,
        accumulated_fees: 0,
        active_vouchers_amount: 0,
        token_mint, 
    });
    Ok(())
}