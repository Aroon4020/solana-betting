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
    pub owner: Signer<'info>,
}

pub fn revoke_event_handler(ctx: Context<RevokeEvent>) -> Result<()> {
    // Verify owner authorization.
    require!(
        ctx.accounts.program_state.owner == ctx.accounts.owner.key(),
        EventBettingProtocolError::Unauthorized
    );

    let event = &mut ctx.accounts.event;
    let program_state = &mut ctx.accounts.program_state;
    let current_time: u64 = Clock::get()?.unix_timestamp.try_into().unwrap();

    // Ensure event has not started.
    require!(
        current_time < event.start_time,
        EventBettingProtocolError::EventCannotBeEnded
    );

    // Ensure no bets have been placed.
    require!(
        event.total_pool == 0,
        EventBettingProtocolError::EventHasBets
    );

    // Adjust active vouchers amount if vouchers were allocated.
    if event.voucher_amount > 0 {
        program_state.active_vouchers_amount = program_state.active_vouchers_amount
            .checked_sub(event.voucher_amount)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
    }

    // Mark event as resolved and clear voucher amount.
    event.voucher_amount = 0;
    event.resolved = true; // Mark as resolved to prevent further interactions

    // Emit Event Revoked event.
    emit!(EventRevoked {
        event_id: event.id,
    });

    Ok(())
}

#[event]
pub struct EventRevoked {
    pub event_id: u64,
}