use anchor_lang::prelude::*;
use solana_program::sysvar::clock::Clock;
use crate::{state::*, constants::*, error::EventBettingProtocolError};
use crate::utils::outcome_hasher::hash_outcome;  // Use the new utility

#[derive(Accounts)]
pub struct CreateEvent<'info> {
    #[account(mut, has_one = owner @ EventBettingProtocolError::Unauthorized)]
    pub program_state: Account<'info, ProgramState>,
    #[account(
        init,
        payer = owner,
        space = 8 + Event::LEN, // Use Event::LEN which now accounts for outcomes
        seeds = [EVENT_SEED, &program_state.next_event_id.to_le_bytes()],
        bump
    )]
    pub event: Account<'info, Event>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn create_event_handler(
    ctx: Context<CreateEvent>,
    description: String,
    start_time: u64,       // now u64
    deadline: u64,         // now u64
    possible_outcomes: Vec<String>,
    voucher_amount: u64,
) -> Result<()> {
    let ps = &mut ctx.accounts.program_state;
    require!(deadline > start_time, EventBettingProtocolError::DeadlineInThePast);
    require!(!possible_outcomes.is_empty(), EventBettingProtocolError::NoOutcomesSpecified);
    let clock = Clock::get()?;
    // Cast clock.unix_timestamp to u64
    require!(start_time > clock.unix_timestamp as u64, EventBettingProtocolError::DeadlineInThePast);

    let event = &mut ctx.accounts.event;
    event.id = ps.next_event_id;
    event.resolved = false;
    event.description = description.clone();
    event.start_time = start_time;
    event.deadline = deadline;
    // Convert each outcome into a 32-byte hash and store using the new field 'outcomes'
    event.outcomes = possible_outcomes.iter().map(|s| hash_outcome(s)).collect();
    event.winning_outcome = None;
    event.total_pool = 0;
    event.voucher_amount = voucher_amount;
    event.total_voucher_claimed = 0;
    event.total_bets_by_outcome = vec![0u64; event.outcomes.len()];

    ps.next_event_id = ps.next_event_id.checked_add(1).ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
    ps.active_vouchers_amount = ps.active_vouchers_amount
        .checked_add(voucher_amount)
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

    emit!(EventCreated {
        event_id: event.id,
        description,
        start_time,
        deadline,
    });

    Ok(())
}

#[event]
pub struct EventCreated {
    pub event_id: u64,
    pub description: String,
    pub start_time: u64,  // changed to u64
    pub deadline: u64,    // changed to u64
}