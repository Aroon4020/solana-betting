use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};
use crate::state::*;
use crate::constants::*;

#[derive(Accounts)]
pub struct InitializeEventPool<'info> {
    #[account(mut)]
    pub event: Account<'info, Event>,

    #[account(
        init,
        payer = payer,
        seeds = [
            EVENT_SEED,
            &event.id.to_le_bytes(),
            b"pool"
        ],
        bump,
        token::mint = token_mint, 
        token::authority = event  
    )]
    pub event_pool: Account<'info, TokenAccount>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub token_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn initialize_event_pool_handler(_ctx: Context<InitializeEventPool>) -> Result<()> {
    Ok(())
}