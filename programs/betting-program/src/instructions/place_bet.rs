use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use anchor_spl::associated_token::get_associated_token_address;
use solana_program::sysvar::clock::Clock;
use crate::{state::*, constants::*, error::EventBettingProtocolError};

#[derive(Accounts)]
#[instruction(outcome: String, amount: u64, vouched_amount: u64)]
pub struct PlaceBet<'info> {
    #[account(mut, seeds = [BETTING_STATE_SEED], bump)]
    pub program_state: Account<'info, ProgramState>,

    /// CHECK: Admin signature is only required when voucher amount is greater than zero.
    pub admin_signer: Option<Signer<'info>>,

    #[account(mut, seeds = [EVENT_SEED, &event.id.to_le_bytes()], bump)]
    pub event: Account<'info, Event>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserBet::LEN,
        seeds = [USER_BET_SEED, user.key().as_ref(), &event.id.to_le_bytes()],
        bump
    )]
    pub user_bet: Account<'info, UserBet>,

    #[account(mut, token::mint = program_state.token_mint)]
    pub user_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        seeds = [EVENT_SEED, &event.id.to_le_bytes(), b"pool"],
        bump,
        token::mint = program_state.token_mint
    )]
    pub event_pool: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        seeds = [BETTING_STATE_SEED, FEE_POOL_SEED],
        bump,
        token::mint = program_state.token_mint
    )]
    pub fee_pool: Account<'info, TokenAccount>,
    
    #[account(mut, signer)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn place_bet_handler(
    ctx: Context<PlaceBet>,
    outcome: String,
    amount: u64,
    vouched_amount: u64,
) -> Result<()> {
    let expected_user_ata = get_associated_token_address(&ctx.accounts.user.key(), &ctx.accounts.program_state.token_mint);
    require!(
        *ctx.accounts.user_token_account.to_account_info().key == expected_user_ata,
        EventBettingProtocolError::InvalidUserATA
    );
    require!(
        ctx.accounts.user_token_account.mint == ctx.accounts.program_state.token_mint,
        EventBettingProtocolError::InvalidUserATA
    );

    let (expected_event_pool, _bump) = Pubkey::find_program_address(
        &[EVENT_SEED, &ctx.accounts.event.id.to_le_bytes(), b"pool"],
        ctx.program_id
    );
    require!(
        ctx.accounts.event_pool.key() == expected_event_pool,
        EventBettingProtocolError::InvalidEventPoolATA
    );
    require!(
        ctx.accounts.event_pool.mint == ctx.accounts.program_state.token_mint,
        EventBettingProtocolError::InvalidEventPoolATA
    );

    let (expected_fee_pool, _bump) = Pubkey::find_program_address(
        &[BETTING_STATE_SEED, FEE_POOL_SEED],
        ctx.program_id
    );
    require!(
        ctx.accounts.fee_pool.key() == expected_fee_pool,
        EventBettingProtocolError::InvalidFeePoolATA
    );
    require!(
        ctx.accounts.fee_pool.mint == ctx.accounts.program_state.token_mint,
        EventBettingProtocolError::InvalidFeePoolATA
    );

    let event = &mut ctx.accounts.event;
    let user_bet = &mut ctx.accounts.user_bet;
    let clock: u64 = Clock::get()?.unix_timestamp as u64;


    require!(clock >= event.start_time, EventBettingProtocolError::BettingNotStarted);
    require!(clock < event.deadline, EventBettingProtocolError::BettingClosed);

    if amount > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.event_pool.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
        )?;
    }

    if vouched_amount > 0 {
        require!(ctx.accounts.admin_signer.is_some(), EventBettingProtocolError::InvalidSignature);

        let program_state_bump = ctx.bumps.program_state;
        let seeds = &[BETTING_STATE_SEED, &[program_state_bump]];
        let signer = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.fee_pool.to_account_info(),
                    to: ctx.accounts.event_pool.to_account_info(),
                    authority: ctx.accounts.program_state.to_account_info(),
                },
                signer,
            ),
            vouched_amount,
        )?;

        ctx.accounts.program_state.accumulated_fees = ctx.accounts.program_state.accumulated_fees
            .checked_sub(vouched_amount)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
        ctx.accounts.program_state.active_vouchers_amount = ctx.accounts.program_state.active_vouchers_amount
            .checked_sub(vouched_amount)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
        event.total_voucher_claimed = event.total_voucher_claimed
            .checked_add(vouched_amount)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
    }

    let outcome_index = event.outcomes.iter().position(|x| x == &outcome)
        .ok_or(EventBettingProtocolError::InvalidOutcome)?;
    let total_bet = amount.checked_add(vouched_amount)
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

    event.total_bets_by_outcome[outcome_index] = event.total_bets_by_outcome[outcome_index]
        .checked_add(total_bet)
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
    event.total_pool = event.total_pool.checked_add(total_bet)
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

    if user_bet.outcome.is_empty() {
        user_bet.outcome = outcome.clone();
    } else {
        require!(user_bet.outcome == outcome, EventBettingProtocolError::InvalidOutcome);
    }
    user_bet.amount = user_bet.amount.checked_add(total_bet)
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

    emit!(BetPlaced{
        event_id: event.id,
        user: ctx.accounts.user.key(),
        bet_amount: amount,
        vouched_amount,
        total_bet,
        outcome,
    });

    Ok(())
}

#[event]
pub struct BetPlaced{
    pub event_id: u64,
    pub user: Pubkey,
    pub bet_amount: u64,
    pub vouched_amount: u64,
    pub total_bet: u64,
    pub outcome: String,
}
