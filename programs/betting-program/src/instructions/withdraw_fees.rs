use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use anchor_spl::associated_token::get_associated_token_address;
use crate::{state::*, constants::*, error::EventBettingProtocolError};

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
        token::mint = program_state.token_mint,
    )]
    pub fee_pool: Account<'info, TokenAccount>,

    #[account(mut, token::mint = program_state.token_mint)]
    pub owner_token_account: Account<'info, TokenAccount>,

    #[account(signer)]
    pub owner: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn withdraw_fees_handler(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
    require!(amount > 0, EventBettingProtocolError::BetAmountZero);
    let program_state = &mut ctx.accounts.program_state;

    let expected_owner_ata = get_associated_token_address(&ctx.accounts.owner.key(), &ctx.accounts.owner_token_account.mint);
    require!(
        *ctx.accounts.owner_token_account.to_account_info().key == expected_owner_ata,
        EventBettingProtocolError::InvalidUserATA
    );

    let (expected_fee_pool, _bump) = Pubkey::find_program_address(&[BETTING_STATE_SEED, FEE_POOL_SEED], ctx.program_id);
    require!(
        ctx.accounts.fee_pool.key() == expected_fee_pool,
        EventBettingProtocolError::InvalidFeePoolATA
    );

    let max_withdrawable = program_state.accumulated_fees.saturating_sub(program_state.active_vouchers_amount);
    
    require!(
        amount <= max_withdrawable,
        EventBettingProtocolError::InsufficientFees
    );

    program_state.accumulated_fees = program_state.accumulated_fees
        .checked_sub(amount)
        .ok_or(EventBettingProtocolError::InsufficientFees)?;

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.fee_pool.to_account_info(),
                to: ctx.accounts.owner_token_account.to_account_info(),
                authority: ctx.accounts.program_state.to_account_info(),
            },
            &[&[BETTING_STATE_SEED, &[ctx.bumps.program_state]]],
        ),
        amount,
    )?;

    emit!(FeesWithdrawn {
        amount: amount,
    });

    Ok(())
}

#[event]
pub struct FeesWithdrawn {
    pub amount: u64,
}