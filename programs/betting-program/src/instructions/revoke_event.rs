use anchor_lang::prelude::*;
use solana_program::sysvar::clock::Clock;
use std::convert::TryInto;
use crate::{state::*, error::EventBettingProtocolError};

#[derive(Accounts)]
pub struct RevokeEvent<'info> {
    #[account(mut, has_one = owner @ EventBettingProtocolError::Unauthorized)]
    pub program_state: Account<'info, ProgramState>,
    #[account(mut)]
    pub event: Account<'info, Event>,
    pub owner: Signer<'info>, // Mark owner as mut for consistency
}

pub fn revoke_event_handler(ctx: Context<RevokeEvent>) -> Result<()> {
    let event = &mut ctx.accounts.event;
    let program_state = &mut ctx.accounts.program_state;
    let clock = Clock::get()?;
    let current_time: u64 = clock.unix_timestamp.try_into().unwrap(); // Convert i64 to u64

    // Check if event hasn't started
    require!(
        current_time < event.start_time,
        EventBettingProtocolError::EventCannotBeEnded
    );

    // Check no bets placed
    require!(
        event.total_pool == 0,
        EventBettingProtocolError::EventHasBets
    );

    // Update active vouchers amount with checked arithmetic
    if event.voucher_amount > 0 {
        program_state.active_vouchers_amount = program_state
            .active_vouchers_amount
            .checked_sub(event.voucher_amount)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
    }

    // Clear event data
    event.voucher_amount = 0;
    event.resolved = true; // Mark as resolved to prevent further interactions

    // Emit event
    emit!(EventRevoked {
        event_id: event.id,
    });

    Ok(())
}

#[event]
pub struct EventRevoked {
    pub event_id: u64,
}