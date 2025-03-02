use anchor_lang::prelude::*;
use solana_program::sysvar::clock::Clock;
use crate::state::*;
use crate::constants::*;
use crate::error::EventBettingProtocolError;

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

    require!(
        program_state.owner == ctx.accounts.owner.key(),
        EventBettingProtocolError::Unauthorized
    );

    require!(
        clock.unix_timestamp < event.start_time,
        EventBettingProtocolError::EventCannotBeEnded
    );

    require!(
        event.total_pool == 0,
        EventBettingProtocolError::EventHasBets
    );

    // Capture current voucher amount and update state.
    let voucher = event.voucher_amount;
    event.voucher_amount = 0;
    if voucher > 0 {
        program_state.active_vouchers_amount = program_state
            .active_vouchers_amount
            .checked_sub(voucher)
            .unwrap();
    }
    Ok(())
}