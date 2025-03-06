// use anchor_lang::prelude::*;
// use anchor_spl::associated_token::AssociatedToken;
// use anchor_spl::token::{Token, TokenAccount, Mint};
// use crate::state::*;
// use crate::constants::*;
// use crate::error::EventBettingProtocolError;

// #[derive(Accounts)]
// pub struct InitializeFeePool<'info> {
//     #[account(
//         init,
//         payer = authority,
//         seeds = [BETTING_STATE_SEED, FEE_POOL_SEED],
//         bump,
//         token::mint = token_mint,
//         token::authority = program_state
//     )]
//     pub fee_pool: Account<'info, TokenAccount>,

//     #[account(mut)]
//     pub authority: Signer<'info>,

//     #[account(
//         mut,
//         seeds = [BETTING_STATE_SEED],
//         bump
//     )]
//     pub program_state: Account<'info, ProgramState>,

//     pub token_mint: Account<'info, Mint>,
//     pub token_program: Program<'info, Token>,
//     pub system_program: Program<'info, System>,
//     pub rent: Sysvar<'info, Rent>,
//     pub associated_token_program: Program<'info, AssociatedToken>,
// }

// pub fn initialize_fee_pool_handler(ctx: Context<InitializeFeePool>) -> Result<()> {
//     let program_state = &ctx.accounts.program_state;
//     require!(
//         program_state.owner == ctx.accounts.authority.key(),
//         EventBettingProtocolError::Unauthorized
//     );
//     Ok(())
// }