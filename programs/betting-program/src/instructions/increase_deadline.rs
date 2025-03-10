use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::EventBettingProtocolError;
use crate::constants::*; 

#[derive(Accounts)]
pub struct IncreaseDeadline<'info> {
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
    pub owner: Signer<'info>,
}

pub fn increase_deadline_handler(
    ctx: Context<IncreaseDeadline>,
    new_deadline: u64,
) -> Result<()> {
    let event = &mut ctx.accounts.event;

    require!(
        new_deadline > event.deadline,
        EventBettingProtocolError::DeadlineInThePast
    );

    event.deadline = new_deadline;

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