use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::EventBettingProtocolError;

#[derive(Accounts)]
pub struct UpdateVoucherAmount<'info> {
    #[account(mut, has_one = owner @ EventBettingProtocolError::Unauthorized)]
    pub program_state: Account<'info, ProgramState>,
    #[account(mut)]
    pub event: Account<'info, Event>,
    pub owner: Signer<'info>, // Mark owner as mut for consistency, even if not mutated in this instruction
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

    let current_amount = event.voucher_amount;
    if new_voucher_amount > current_amount {
        let increase = new_voucher_amount.checked_sub(current_amount).unwrap();
        require!(
            program_state.accumulated_fees
                >= program_state.active_vouchers_amount.checked_add(increase).unwrap(),
            EventBettingProtocolError::InsufficientProtocolFees
        );
        program_state.active_vouchers_amount = program_state
            .active_vouchers_amount
            .checked_add(increase)
            .unwrap();
    } else if new_voucher_amount < current_amount {
        let decrease = current_amount.checked_sub(new_voucher_amount).unwrap();
        program_state.active_vouchers_amount = program_state
            .active_vouchers_amount
            .checked_sub(decrease)
            .unwrap();
    }
    event.voucher_amount = new_voucher_amount;
    Ok(())
}