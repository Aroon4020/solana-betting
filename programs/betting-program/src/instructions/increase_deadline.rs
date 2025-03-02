use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::EventBettingProtocolError;

#[derive(Accounts)]
pub struct IncreaseDeadline<'info> {
    #[account(mut, has_one = owner @ EventBettingProtocolError::Unauthorized)]
    pub program_state: Account<'info, ProgramState>,
    #[account(mut)]
    pub event: Account<'info, Event>,
    pub owner: Signer<'info>, // Mark owner as mut for consistency
}

pub fn increase_deadline_handler(
    ctx: Context<IncreaseDeadline>,
    new_deadline: i64,
) -> Result<()> {
    let event = &mut ctx.accounts.event;
    require!(
        new_deadline > event.deadline,
        EventBettingProtocolError::DeadlineInThePast
    );
    event.deadline = new_deadline;
    Ok(())
}