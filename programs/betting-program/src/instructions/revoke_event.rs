use anchor_lang::prelude::*;
use solana_program::sysvar::clock::Clock;
use std::convert::TryInto;
use crate::{state::*, constants::*, error::EventBettingProtocolError};

#[derive(Accounts)]
pub struct RevokeEvent<'info> {
    // Remove mut as we don't modify the signer
    #[account(signer)]
    pub owner: Signer<'info>,

    #[account(
        mut, 
        seeds = [BETTING_STATE_SEED],
        bump,
        has_one = owner @ EventBettingProtocolError::Unauthorized
    )]
    pub program_state: Account<'info, ProgramState>,

    #[account(
        mut,
        seeds = [EVENT_SEED, &event.id.to_le_bytes()],
        bump
    )]
    pub event: Account<'info, Event>,
}

pub fn revoke_event_handler(ctx: Context<RevokeEvent>) -> Result<()> {
    require!(
        ctx.accounts.program_state.owner == ctx.accounts.owner.key(),
        EventBettingProtocolError::Unauthorized
    );

    let event = &mut ctx.accounts.event;
    let program_state = &mut ctx.accounts.program_state;
    let current_time: u64 = Clock::get()?.unix_timestamp.try_into().unwrap();

    require!(current_time < event.start_time, EventBettingProtocolError::EventCannotBeEnded);
    require!(event.total_pool == 0, EventBettingProtocolError::EventHasBets);

    if event.voucher_amount > 0 {
        program_state.active_vouchers_amount = program_state.active_vouchers_amount
            .checked_sub(event.voucher_amount)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
    }

    event.voucher_amount = 0;
    event.resolved = true;

    emit!(EventRevoked {
        event_id: event.id,
    });

    Ok(())
}

#[event]
pub struct EventRevoked {
    pub event_id: u64,
}
