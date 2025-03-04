use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::{state::*, constants::*, error::*};

#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    #[account(
        mut,
        seeds = [BETTING_STATE_SEED],
        bump,
        has_one = owner @ EventBettingProtocolError::Unauthorized
    )]
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

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    pub clock: Sysvar<'info, Clock>,
}

pub fn withdraw_fees_handler(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
    // Validate amount
    require!(amount != 0, EventBettingProtocolError::WithdrawAmountZero);
    
    // Validate owner
    let program_state = &mut ctx.accounts.program_state;
    require!(
        ctx.accounts.owner.key() == program_state.owner,
        EventBettingProtocolError::Unauthorized
    );

    // Calculate maximum withdrawable amount (matches Solidity's check)
    let max_withdrawable = program_state
        .accumulated_fees
        .checked_sub(program_state.active_vouchers_amount)
        .ok_or(EventBettingProtocolError::InsufficientFees)?;

    // Adjust amount if it exceeds max withdrawable
    let withdraw_amount = if amount > max_withdrawable {
        max_withdrawable
    } else {
        amount
    };

    // Update accumulated fees
    program_state.accumulated_fees = program_state
        .accumulated_fees
        .checked_sub(withdraw_amount)
        .ok_or(EventBettingProtocolError::InsufficientFees)?;

    // Transfer tokens
    let seeds = &[BETTING_STATE_SEED, &[ctx.bumps.program_state]];
    let signer = &[&seeds[..]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.fee_pool.to_account_info(),
                to: ctx.accounts.owner_token_account.to_account_info(),
                authority: ctx.accounts.program_state.to_account_info(),
            },
            signer,
        ),
        withdraw_amount,
    )?;

    // Emit event
    emit!(FeesWithdrawn {
        amount: withdraw_amount,
    });

    Ok(())
}

#[event]
pub struct FeesWithdrawn {
    pub amount: u64,
}