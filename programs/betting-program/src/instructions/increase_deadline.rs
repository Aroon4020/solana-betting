use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::EventBettingProtocolError;

#[derive(Accounts)]
pub struct IncreaseDeadline<'info> {
    #[account(mut, has_one = owner @ EventBettingProtocolError::Unauthorized)]
    pub program_state: Account<'info, ProgramState>,
    #[account(mut)]
    pub event: Account<'info, Event>,
    pub owner: Signer<'info>,
}

pub fn increase_deadline_handler(
    ctx: Context<IncreaseDeadline>,
    new_deadline: u64,
) -> Result<()> {
    let event = &mut ctx.accounts.event;

    // Ensure the new deadline is later than the current deadline
    require!(
        new_deadline > event.deadline,
        EventBettingProtocolError::DeadlineInThePast
    );

    // Update the event deadline
    event.deadline = new_deadline;

    // Emit event indicating deadline increase
    emit!(DeadlineIncreased {
        event_id: event.id,
        new_deadline,
    });

    Ok(())
}

#[event]
pub struct DeadlineIncreased {
    pub event_id: u64,
    pub new_deadline: u64,
}