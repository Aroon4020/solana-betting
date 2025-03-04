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
    
    // Check if event is not resolved (matches Solidity's check)
    require!(
        event.winning_outcome.is_none(),
        EventBettingProtocolError::VoucherUpdateNotAllowed
    );

    // Check if new amount covers claimed vouchers (matches Solidity's check)
    require!(
        new_voucher_amount >= event.total_voucher_claimed,
        EventBettingProtocolError::InsufficientVoucherAmount
    );

    let old_amount = event.voucher_amount;
    
    // Calculate voucher difference (matches Solidity's approach)
    let voucher_diff = if new_voucher_amount > old_amount {
        new_voucher_amount
            .checked_sub(old_amount)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?
    } else {
        old_amount
            .checked_sub(new_voucher_amount)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?
    };

    // Handle increase or decrease in voucher amount
    if new_voucher_amount > old_amount {
        // Check if protocol has enough fees (matches Solidity's check)
        require!(
            program_state.accumulated_fees >= program_state
                .active_vouchers_amount
                .checked_add(voucher_diff)
                .ok_or(EventBettingProtocolError::ArithmeticOverflow)?,
            EventBettingProtocolError::InsufficientProtocolFees
        );

        program_state.active_vouchers_amount = program_state
            .active_vouchers_amount
            .checked_add(voucher_diff)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
    } else {
        program_state.active_vouchers_amount = program_state
            .active_vouchers_amount
            .checked_sub(voucher_diff)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
    }

    // Update event voucher amount
    event.voucher_amount = new_voucher_amount;

    // Emit event (matches Solidity's event emission)
    emit!(VoucherAmountUpdated {
        event_id: event.id,
        old_amount,
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