use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer}; // Import token module
use solana_program::sysvar::clock::Clock;
use crate::state::*;
use crate::constants::*;
use crate::error::EventBettingProtocolError;

#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    #[account(mut, has_one = owner @ EventBettingProtocolError::Unauthorized)]
    pub program_state: Account<'info, ProgramState>,

    #[account(
        mut,
        seeds = [BETTING_STATE_SEED, FEE_POOL_SEED],
        bump,
        token::mint = owner_token_account.mint,
    )]
    pub fee_pool: Account<'info, TokenAccount>,
    #[account(mut)]
    pub owner_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [PROGRAM_AUTHORITY_SEED],
        bump
    )]
    pub program_authority: Account<'info, ProgramState>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    pub clock: Sysvar<'info, Clock>,
}

pub fn withdraw_fees_handler(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
    require!(amount != 0, EventBettingProtocolError::WithdrawAmountZero);
    let program_state = &mut ctx.accounts.program_state;
    require!(
        ctx.accounts.owner.key() == program_state.owner,
        EventBettingProtocolError::Unauthorized
    );

    program_state.accumulated_fees = program_state
        .accumulated_fees
        .checked_sub(amount)
        .ok_or(EventBettingProtocolError::InsufficientFees)?;

    // Bind the bump value to extend its lifetime.
    let bump = ctx.bumps.program_authority;
    let binding = [bump];
    let signer_seeds = &[&[PROGRAM_AUTHORITY_SEED, &binding][..]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.fee_pool.to_account_info(),
                to: ctx.accounts.owner_token_account.to_account_info(),
                authority: ctx.accounts.program_authority.to_account_info(),
            },
            &[&[PROGRAM_AUTHORITY_SEED, &[ctx.bumps.program_authority]]],
        ),
        amount,
    )?;
    Ok(())
}