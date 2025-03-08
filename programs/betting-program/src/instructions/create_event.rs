use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};
use solana_program::sysvar::clock::Clock;
use crate::{state::*, constants::*, error::EventBettingProtocolError};

#[derive(Accounts)]
pub struct CreateEvent<'info> {
    // Signer first.
    #[account(mut, signer)]
    pub owner: Signer<'info>,

    #[account(mut, has_one = owner @ EventBettingProtocolError::Unauthorized)]
    pub program_state: Account<'info, ProgramState>,

    #[account(
        init,
        payer = owner,
        space = 8 + Event::LEN,
        seeds = [EVENT_SEED, &program_state.next_event_id.to_le_bytes()],
        bump
    )]
    pub event: Account<'info, Event>,

    #[account(
        init,
        payer = owner,
        seeds = [EVENT_SEED, &program_state.next_event_id.to_le_bytes(), b"pool"],
        bump,
        token::mint = token_mint,
        token::authority = event
    )]
    pub event_pool: Account<'info, TokenAccount>,

    #[account(constraint = token_mint.key() == program_state.token_mint)]
    pub token_mint: Account<'info, Mint>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn create_event_handler(
    ctx: Context<CreateEvent>,
    description: String,
    start_time: u64,
    deadline: u64,
    possible_outcomes: Vec<String>,
    voucher_amount: u64,
) -> Result<()> {
    //let current_timestamp: u64 = Clock::get()?.try_into().unwrap();
    let current_timestamp: u64 = Clock::get()?.unix_timestamp as u64;

    require!(deadline > start_time, EventBettingProtocolError::DeadlineInThePast);
    require!(start_time > current_timestamp, EventBettingProtocolError::StartTimeInThePast);
    require!(!possible_outcomes.is_empty(), EventBettingProtocolError::NoOutcomesSpecified);

    let program_state = &mut ctx.accounts.program_state;
    let event = &mut ctx.accounts.event;

    event.id = program_state.next_event_id;
    event.resolved = false;
    event.description = description;
    event.start_time = start_time;
    event.deadline = deadline;
    event.outcomes = possible_outcomes;
    event.winning_outcome = None;
    event.total_pool = 0;
    event.voucher_amount = voucher_amount;
    event.total_voucher_claimed = 0;
    event.total_bets_by_outcome = vec![0u64; event.outcomes.len()];

    program_state.next_event_id = program_state.next_event_id
        .checked_add(1)
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
    program_state.active_vouchers_amount = program_state.active_vouchers_amount
        .checked_add(voucher_amount)
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

    emit!(EventCreated {
        event_id: event.id,
        description: event.description.clone(),
        start_time,
        deadline,
    });

    Ok(())
}

#[event]
pub struct EventCreated {
    pub event_id: u64,
    pub description: String,
    pub start_time: u64,
    pub deadline: u64,
}
