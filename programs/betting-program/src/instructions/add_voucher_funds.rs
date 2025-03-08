use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};
use anchor_spl::associated_token::get_associated_token_address;
use solana_program::pubkey::Pubkey;
use crate::{state::*, constants::*, error::EventBettingProtocolError};

#[derive(Accounts)]
pub struct AddVoucherFunds<'info> {
    #[account(signer)]
    pub fund_source: Signer<'info>,

    #[account(mut, seeds = [BETTING_STATE_SEED], bump)]
    pub program_state: Account<'info, ProgramState>,

    #[account(mut, token::mint = program_state.token_mint)]
    pub user_token_account: Account<'info, TokenAccount>,    

    #[account(
        mut,
        seeds = [BETTING_STATE_SEED, FEE_POOL_SEED],
        bump,
        token::mint = program_state.token_mint,
        token::authority = program_state,
    )]
    pub fee_pool: Account<'info, TokenAccount>,

    // Check that the provided token mint equals the one in program state.
    pub token_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

pub fn add_voucher_funds_handler(ctx: Context<AddVoucherFunds>, amount: u64) -> Result<()> {
    require!(amount > 0, EventBettingProtocolError::BetAmountZero);

    require!(
        ctx.accounts.token_mint.key() == ctx.accounts.program_state.token_mint,
        EventBettingProtocolError::InvalidTokenMint
    );

    let expected_sender_ata = get_associated_token_address(&ctx.accounts.fund_source.key(), &ctx.accounts.token_mint.key());
    require!(
        *ctx.accounts.user_token_account.to_account_info().key == expected_sender_ata,
        EventBettingProtocolError::InvalidUserATA
    );

    let (expected_fee_pool, _bump) = Pubkey::find_program_address(&[BETTING_STATE_SEED, FEE_POOL_SEED], ctx.program_id);
    require!(
        ctx.accounts.fee_pool.key() == expected_fee_pool,
        EventBettingProtocolError::InvalidFeePoolATA
    );

    ctx.accounts.program_state.accumulated_fees = ctx.accounts.program_state.accumulated_fees
        .checked_add(amount)
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

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

    emit!(VoucherFundsAdded { amount });
    Ok(())
}

#[event]
pub struct VoucherFundsAdded {
    pub amount: u64,
}
