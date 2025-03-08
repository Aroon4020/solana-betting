use anchor_lang::prelude::*;
use crate::{state::*, constants::*, error::EventBettingProtocolError};

#[derive(Accounts)]
pub struct UpdateVoucherAmount<'info> {
    // Remove mut from signer since we're not modifying it
    #[account(signer)]
    pub owner: Signer<'info>,

    // Add proper PDA validation
    #[account(
        mut,
        seeds = [BETTING_STATE_SEED],
        bump,
        has_one = owner @ EventBettingProtocolError::Unauthorized
    )]
    pub program_state: Account<'info, ProgramState>,

    // Add proper PDA validation for event
    #[account(
        mut,
        seeds = [EVENT_SEED, &event.id.to_le_bytes()],
        bump
    )]
    pub event: Account<'info, Event>,
}

pub fn update_voucher_amount_handler(
    ctx: Context<UpdateVoucherAmount>,
    new_voucher_amount: u64,
) -> Result<()> {
    let event = &mut ctx.accounts.event;
    let program_state = &mut ctx.accounts.program_state;

    require!(
        event.winning_outcome.is_none(),
        EventBettingProtocolError::VoucherUpdateNotAllowed
    );
    require!(
        new_voucher_amount >= event.total_voucher_claimed,
        EventBettingProtocolError::InsufficientVoucherAmount
    );

    let old_voucher_amount = event.voucher_amount;
    let voucher_diff;

    if new_voucher_amount > old_voucher_amount {
        voucher_diff = new_voucher_amount
            .checked_sub(old_voucher_amount)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

        require!(
            program_state.accumulated_fees >= program_state.active_vouchers_amount
                .checked_add(voucher_diff)
                .ok_or(EventBettingProtocolError::ArithmeticOverflow)?,
            EventBettingProtocolError::InsufficientProtocolFees
        );

        program_state.active_vouchers_amount = program_state.active_vouchers_amount
            .checked_add(voucher_diff)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
    } else {
        voucher_diff = old_voucher_amount
            .checked_sub(new_voucher_amount)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
        program_state.active_vouchers_amount = program_state.active_vouchers_amount
            .checked_sub(voucher_diff)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
    }

    event.voucher_amount = new_voucher_amount;

    emit!(VoucherAmountUpdated {
        event_id: event.id,
        old_amount: old_voucher_amount,
        new_amount: new_voucher_amount,
    });

    Ok(())
}

#[event]
pub struct VoucherAmountUpdated {
    pub event_id: u64,
    pub old_amount: u64,
    pub new_amount: u64,
}
