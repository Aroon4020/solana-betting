use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};
use crate::{state::*, constants::*, error::EventBettingProtocolError};

#[derive(Accounts)]
pub struct AddVoucherFunds<'info> {
    #[account(
        mut,
        seeds = [BETTING_STATE_SEED],
        bump
    )]
    pub program_state: Account<'info, ProgramState>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [BETTING_STATE_SEED, FEE_POOL_SEED],
        bump,
        token::mint = token_mint,
        token::authority = program_state,
    )]
    pub fee_pool: Account<'info, TokenAccount>,

    #[account(mut)]
    pub fund_source: Signer<'info>,

    pub token_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

pub fn add_voucher_funds_handler(ctx: Context<AddVoucherFunds>, amount: u64) -> Result<()> {
    // Validate amount (matches Solidity's check)
    require!(amount > 0, EventBettingProtocolError::BetAmountZero);

    // Update program state with checked arithmetic
    ctx.accounts.program_state.accumulated_fees = ctx
        .accounts
        .program_state
        .accumulated_fees
        .checked_add(amount)
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

    // Transfer tokens from user to fee pool
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_token_account.to_account_info(),
                to: ctx.accounts.fee_pool.to_account_info(),
                authority: ctx.accounts.fund_source.to_account_info(),
            },
        ),
        amount,
    )?;

    // Emit event (matches Solidity's event emission)
    emit!(VoucherFundsAdded {
        amount,
    });

    Ok(())
}
#[event]
pub struct VoucherFundsAdded {
    pub amount: u64,
}