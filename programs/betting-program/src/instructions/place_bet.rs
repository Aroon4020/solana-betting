use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use solana_program::sysvar::clock::Clock;
use crate::{state::*, constants::*, error::EventBettingProtocolError};

#[derive(Accounts)]
#[instruction(outcome: String, amount: u64, vouched_amount: u64)]
pub struct PlaceBet<'info> {
    #[account(mut, seeds = [BETTING_STATE_SEED], bump)]
    pub program_state: Account<'info, ProgramState>,

    pub admin_signer: Signer<'info>,

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
    let event = &mut ctx.accounts.event;
    let user_bet = &mut ctx.accounts.user_bet;
    let clock: u64 = Clock::get()?.unix_timestamp as u64;

    // Keep essential business logic validations
    require!(clock >= event.start_time, EventBettingProtocolError::BettingNotStarted);
    require!(clock < event.deadline, EventBettingProtocolError::BettingClosed);

    // Process user funds transfer if amount > 0
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

    // Process voucher transfer if vouched_amount > 0
    if vouched_amount > 0 {
        require!(
            ctx.accounts.admin_signer.key() == ctx.accounts.program_state.signer,
            EventBettingProtocolError::InvalidSignature
        );

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
