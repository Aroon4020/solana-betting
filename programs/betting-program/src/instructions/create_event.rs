use anchor_lang::prelude::*;
use solana_program::sysvar::clock::Clock;
use crate::state::*;
use crate::constants::*;
use crate::error::EventBettingProtocolError;

#[derive(Accounts)]
pub struct CreateEvent<'info> {
    #[account(mut, has_one = owner @ EventBettingProtocolError::Unauthorized)]
    pub program_state: Account<'info, ProgramState>,
    #[account(
        init,
        payer = owner,
        space = 8 + 8 + 1024 + (4 + 50 * 10) + 8 * 5, // Re-calculate space if needed for consistency and correctness
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
    start_time: i64,
    deadline: i64,
    possible_outcomes: Vec<String>,
    voucher_amount: u64,
) -> Result<()> {
    let ps = &mut ctx.accounts.program_state;
    require!(deadline > start_time, EventBettingProtocolError::DeadlineInThePast);
    require!(!possible_outcomes.is_empty(), EventBettingProtocolError::NoOutcomesSpecified);
    require!(
        ps.accumulated_fees >= ps.active_vouchers_amount + voucher_amount,
        EventBettingProtocolError::InsufficientProtocolFees
    );
    let clock = Clock::get()?;
    require!(
        start_time > clock.unix_timestamp,
        EventBettingProtocolError::DeadlineInThePast
    );

    let event = &mut ctx.accounts.event;
    event.id = ps.next_event_id;
    event.resolved = false;
    event.description = description.clone(); // Clone for event emission
    event.start_time = start_time;
    event.deadline = deadline;
    event.possible_outcomes = possible_outcomes;
    event.voucher_amount = voucher_amount;
    event.total_voucher_claimed = 0;
    event.total_pool = 0;
    event.winning_outcome = None;
    event.total_bets_by_outcome = vec![0u64; event.possible_outcomes.len()];

    ps.next_event_id = ps.next_event_id.checked_add(1).ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
    ps.active_vouchers_amount = ps.active_vouchers_amount
        .checked_add(voucher_amount)
        .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

    // Emit event
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
    pub start_time: i64,
    pub deadline: i64,
}