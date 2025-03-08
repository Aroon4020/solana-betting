use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::EventBettingProtocolError;

#[derive(Accounts)]
pub struct UpdateVoucherAmount<'info> {
    #[account(mut, has_one = owner @ EventBettingProtocolError::Unauthorized)]
    pub program_state: Account<'info, ProgramState>,
    #[account(mut)]
    pub event: Account<'info, Event>,
    pub owner: Signer<'info>,
}

pub fn update_voucher_amount_handler(
    ctx: Context<UpdateVoucherAmount>,
    new_voucher_amount: u64,
) -> Result<()> {
    let event = &mut ctx.accounts.event;
    let program_state = &mut ctx.accounts.program_state;

    // Prevent voucher amount updates for resolved events
    require!(
        event.winning_outcome.is_none(),
        EventBettingProtocolError::VoucherUpdateNotAllowed
    );

    // Ensure new voucher amount is sufficient for already claimed vouchers
    require!(
        new_voucher_amount >= event.total_voucher_claimed,
        EventBettingProtocolError::InsufficientVoucherAmount
    );

    let old_voucher_amount = event.voucher_amount;
    let voucher_diff;

    // Calculate the difference in voucher amounts
    if new_voucher_amount > old_voucher_amount {
        voucher_diff = new_voucher_amount
            .checked_sub(old_voucher_amount)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

        // For voucher increase, ensure protocol has sufficient accumulated fees
        require!(
            program_state.accumulated_fees >= program_state.active_vouchers_amount
                .checked_add(voucher_diff)
                .ok_or(EventBettingProtocolError::ArithmeticOverflow)?,
            EventBettingProtocolError::InsufficientProtocolFees
        );

        // Increase active voucher amount in program state
        program_state.active_vouchers_amount = program_state.active_vouchers_amount
            .checked_add(voucher_diff)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
    } else {
        voucher_diff = old_voucher_amount
            .checked_sub(new_voucher_amount)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

        // Decrease active voucher amount in program state
        program_state.active_vouchers_amount = program_state.active_vouchers_amount
            .checked_sub(voucher_diff)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
    }

    // Update event's voucher amount
    event.voucher_amount = new_voucher_amount;

    // Emit Voucher Amount Updated event
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