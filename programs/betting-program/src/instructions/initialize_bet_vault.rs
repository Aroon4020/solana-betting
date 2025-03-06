use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Token, TokenAccount, Mint};
use crate::constants::*;

#[derive(Accounts)]
pub struct InitializeBetVault<'info> {
    #[account(
        init,
        payer = owner,
        associated_token::mint = token_mint,
        associated_token::authority = bet_vault_authority
    )]
    pub bet_vault: Account<'info, TokenAccount>,

    /// CHECK: This PDA is used solely as the authority for the bet-vault ATA.
    #[account(
        seeds = [BET_VAULT_SEED],
        bump
    )]
    pub bet_vault_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub token_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn initialize_bet_vault_handler(ctx: Context<InitializeBetVault>) -> Result<()> {
    // The ATA is created automatically by Anchor.
    Ok(())
}
