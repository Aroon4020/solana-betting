use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken; // <-- Added missing import
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use solana_program::{
    account_info::AccountInfo,
    sysvar::clock::Clock,
};

mod error;

use crate::error::EventBettingProtocolError;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

// Constants and seeds (Consistent naming: SCREAMING_SNAKE_CASE for constants)
pub const BETTING_STATE_SEED: &[u8] = b"program_state";
pub const EVENT_SEED: &[u8] = b"event";
pub const USER_BET_SEED: &[u8] = b"user_bet";
pub const FEE_POOL_SEED: &[u8] = b"fee_pool";
pub const PROGRAM_AUTHORITY_SEED: &[u8] = b"program_authority";

#[program]
pub mod event_betting {
    use super::*;

    // Initialize program state (Consistent function naming: snake_case)
    pub fn initialize(
        ctx: Context<Initialize>,
        fee_percentage: u64,
        signer: Pubkey,
    ) -> Result<()> {
        ctx.accounts.program_state.set_inner(ProgramState {
            fee_percentage,
            signer,
            owner: ctx.accounts.owner.key(),
            next_event_id: 0,
            accumulated_fees: 0,
            active_vouchers_amount: 0,
        });
        Ok(())
    }

    // Create new event (owner-only)
    pub fn create_event(
        ctx: Context<CreateEvent>,
        description: String,
        start_time: i64,
        deadline: i64,
        possible_outcomes: Vec<String>,
        voucher_amount: u64,
    ) -> Result<()> {
        let ps = &mut ctx.accounts.program_state;
        require!(deadline > start_time, EventBettingProtocolError::DeadlineInThePast);
        require!(!possible_outcomes.is_empty(), EventBettingProtocolError::NoOutcomesSpecified);
        require!(
            ps.accumulated_fees >= ps.active_vouchers_amount + voucher_amount,
            EventBettingProtocolError::InsufficientProtocolFees
        );
        let clock = Clock::get()?;
        require!(
            start_time > clock.unix_timestamp,
            EventBettingProtocolError::DeadlineInThePast
        );

        let event = &mut ctx.accounts.event;
        event.id = ps.next_event_id;
        event.resolved = false;
        event.description = description;
        event.start_time = start_time;
        event.deadline = deadline;
        event.possible_outcomes = possible_outcomes;
        event.voucher_amount = voucher_amount;
        event.total_voucher_claimed = 0;
        event.total_pool = 0;
        event.winning_outcome = None;
        event.total_bets_by_outcome = vec![0u64; event.possible_outcomes.len()];

        ps.next_event_id = ps.next_event_id.checked_add(1).unwrap();
        ps.active_vouchers_amount = ps.active_vouchers_amount.checked_add(voucher_amount).unwrap();
        Ok(())
    }

    pub fn initialize_fee_pool(ctx: Context<InitializeFeePool>) -> Result<()> {
        let program_state = &ctx.accounts.program_state;
        require!(
            program_state.owner == ctx.accounts.authority.key(),
            EventBettingProtocolError::Unauthorized
        );
        Ok(())
    }

    pub fn place_bet(
        ctx: Context<PlaceBet>,
        outcome: String,
        amount: u64,
    ) -> Result<()> {
        // Define current_time before use.
        let current_time = Clock::get()?.unix_timestamp;
        require!(amount > 0, EventBettingProtocolError::BetAmountZero);
        require!(
            current_time < ctx.accounts.event.deadline,
            EventBettingProtocolError::BettingClosed
        );

        // Lookup outcome index
        let outcome_index = ctx
            .accounts
            .event
            .possible_outcomes
            .iter()
            .position(|opt| opt == &outcome)
            .ok_or(EventBettingProtocolError::InvalidOutcome)?;

        // Update outcome total bets safely
        ctx.accounts.event.total_bets_by_outcome[outcome_index] = ctx
            .accounts
            .event
            .total_bets_by_outcome[outcome_index]
            .checked_add(amount)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

        // Transfer tokens from user to event pool
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.event_pool.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
        )?;

        // Set user bet outcome if not set; if exists then verify it matches
        if ctx.accounts.user_bet.outcome.is_empty() {
            ctx.accounts.user_bet.outcome = outcome.clone();
        } else {
            require!(
                ctx.accounts.user_bet.outcome == outcome,
                EventBettingProtocolError::InvalidOutcome
            );
        }

        ctx.accounts.user_bet.amount = ctx.accounts.user_bet.amount.checked_add(amount).unwrap();
        ctx.accounts.event.total_pool = ctx.accounts.event.total_pool.checked_add(amount).unwrap();

        Ok(())
    }

    // Place standard bet
    pub fn place_bet_with_voucher(
        ctx: Context<PlaceBetWithVoucher>,
        outcome: String,
        amount: u64,
        vouched_amount: u64,
        nonce: u64,
    ) -> Result<()> {
        if vouched_amount > 0 {
            require!(
                ctx.accounts.admin_signer.is_some(),
                EventBettingProtocolError::InvalidSignature
            );
        }
        // Get current time
        let clock = Clock::get()?;
        let event = &mut ctx.accounts.event;
        let user_bet = &mut ctx.accounts.user_bet;
        require!(vouched_amount > 0, EventBettingProtocolError::VouchedAmountZero);
        require!(
            vouched_amount <= event
                .voucher_amount
                .checked_sub(event.total_voucher_claimed)
                .ok_or(EventBettingProtocolError::ArithmeticOverflow)?,
            EventBettingProtocolError::VoucherAmountExceedsLimit
        );
        require!(nonce == user_bet.nonce, EventBettingProtocolError::InvalidNonce);
        require!(
            clock.unix_timestamp < event.deadline,
            EventBettingProtocolError::BettingClosed
        );

        if amount > 0 {
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.user_token_account.to_account_info(),
                        to: ctx.accounts.event_pool.to_account_info(),
                        authority: ctx.accounts.user.to_account_info(),
                    },
                ),
                amount,
            )?;
        }
        let seeds = &[PROGRAM_AUTHORITY_SEED, &[ctx.bumps.program_authority]];
        let signer = &[&seeds[..]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.fee_pool.to_account_info(),
                    to: ctx.accounts.event_pool.to_account_info(),
                    authority: ctx.accounts.program_authority.to_account_info(),
                },
                signer,
            ),
            vouched_amount,
        )?;

        // Update state
        ctx.accounts.program_state.accumulated_fees = ctx
            .accounts
            .program_state
            .accumulated_fees
            .checked_sub(vouched_amount)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
        ctx.accounts.program_state.active_vouchers_amount = ctx
            .accounts
            .program_state
            .active_vouchers_amount
            .checked_sub(vouched_amount)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
        event.total_voucher_claimed = event.total_voucher_claimed.checked_add(vouched_amount).unwrap();
        let outcome_index = event
            .possible_outcomes
            .iter()
            .position(|x| x == &outcome)
            .ok_or(EventBettingProtocolError::InvalidOutcome)?;
        let total_bet = amount
            .checked_add(vouched_amount)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
        event.total_bets_by_outcome[outcome_index] = event
            .total_bets_by_outcome[outcome_index]
            .checked_add(total_bet)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;
        event.total_pool = event.total_pool.checked_add(total_bet).unwrap();
        if user_bet.outcome.is_empty() {
            user_bet.outcome = outcome;
        } else {
            require!(
                user_bet.outcome == outcome,
                EventBettingProtocolError::InvalidOutcome
            );
        }
        user_bet.amount = user_bet.amount.checked_add(total_bet).unwrap();
        user_bet.nonce = nonce.checked_add(1).unwrap();

        Ok(())
    }

    pub fn resolve_event(ctx: Context<ResolveEvent>, winning_outcome: String) -> Result<()> {
        let event = &mut ctx.accounts.event;
        let fee_pool = &ctx.accounts.fee_pool;
        let token_program = &ctx.accounts.token_program;
        let program_state = &mut ctx.accounts.program_state;

        // Security checks
        require!(
            program_state.owner == ctx.accounts.owner.key(),
            EventBettingProtocolError::Unauthorized
        );
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp >= event.deadline,
            EventBettingProtocolError::EventStillActive
        );
        require!(
            !event.resolved,
            EventBettingProtocolError::EventAlreadyResolved
        );

        // Validate winning outcome index (unused; prefix with underscore)
        let _winning_index = event
            .possible_outcomes
            .iter()
            .position(|x| x == &winning_outcome)
            .ok_or(EventBettingProtocolError::InvalidWinningOutcome)?;

        // Calculate fee from pool
        let total_event_pool =
            token::accessor::amount(&ctx.accounts.event_pool.to_account_info())?;
        let fee = (total_event_pool as u128)
            .checked_mul(program_state.fee_percentage as u128)
            .unwrap()
            .checked_div(10000)
            .unwrap() as u64;

        // Mark event as resolved
        event.resolved = true;
        event.winning_outcome = Some(winning_outcome);

        // Derive signer seeds for the event PDA used in token transfer
        let event_seeds = &[
            EVENT_SEED,
            &event.id.to_le_bytes(),
            &[ctx.bumps.event],
        ];
        let signer = &[&event_seeds[..]];

        // Transfer fee from event pool to fee pool
        token::transfer(
            CpiContext::new_with_signer(
                token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.event_pool.to_account_info(),
                    to: fee_pool.to_account_info(),
                    authority: event.to_account_info(),
                },
                signer,
            ),
            fee,
        )?;

        // Update state values
        program_state.accumulated_fees = program_state.accumulated_fees.checked_add(fee).unwrap();

        event.total_pool = event
            .total_pool
            .checked_sub(fee)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

        Ok(())
    }

    // Claim winnings
    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        let event = &mut ctx.accounts.event;
        let user_bet = &mut ctx.accounts.user_bet;

        // Ensure the event is resolved and the user's outcome matches
        let winning = event
            .winning_outcome
            .as_ref()
            .ok_or(EventBettingProtocolError::EventNotResolvedYet)?;
        require!(winning == &user_bet.outcome, EventBettingProtocolError::InvalidOutcome);
        require!(user_bet.amount > 0, EventBettingProtocolError::NoWinningsToClaim);

        // Compute winning index and ensure valid total winning bets
        let win_idx = event
            .possible_outcomes
            .iter()
            .position(|opt| opt == winning)
            .ok_or(EventBettingProtocolError::InvalidOutcome)?;
        let total_winning_bets = event.total_bets_by_outcome[win_idx];
        require!(
            total_winning_bets > 0,
            EventBettingProtocolError::ArithmeticOverflow
        );

        // Calculate payout based on the user's share of winning bets
        let total_pool_after_fees = event.total_pool;
        let payout = total_pool_after_fees
            .checked_mul(user_bet.amount)
            .and_then(|v| v.checked_div(total_winning_bets))
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

        // Derive signer seeds for the event PDA
        let signer_seeds = &[
            EVENT_SEED,
            &event.id.to_le_bytes(),
            &[ctx.bumps.event],
        ];
        let signer = &[&signer_seeds[..]];

        // Transfer payout tokens from event pool to user's token account
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.event_pool.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: event.to_account_info(),
                },
                signer,
            ),
            payout,
        )?;

        // Reset user's bet amount after claim
        user_bet.amount = 0;

        Ok(())
    }

    // Owner-only: Update voucher amount
    pub fn update_voucher_amount(
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

    // Owner-only: Withdraw fees
    pub fn withdraw_fees(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
        require!(amount != 0, EventBettingProtocolError::WithdrawAmountZero);
        let program_state = &mut ctx.accounts.program_state;
        require!(
            ctx.accounts.owner.key() == program_state.owner,
            EventBettingProtocolError::Unauthorized
        );

        program_state.accumulated_fees = program_state
            .accumulated_fees
            .checked_sub(amount)
            .ok_or(EventBettingProtocolError::InsufficientFees)?;

        // Bind the bump value to extend its lifetime.
        let bump = ctx.bumps.program_authority;
        let binding = [bump];
        let signer_seeds = &[&[PROGRAM_AUTHORITY_SEED, &binding][..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.fee_pool.to_account_info(),
            to: ctx.accounts.owner_token_account.to_account_info(),
            authority: ctx.accounts.program_authority.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        token::transfer(cpi_ctx, amount)?;
        Ok(())
    }

    // Owner-only: Revoke event
    pub fn revoke_event(ctx: Context<RevokeEvent>) -> Result<()> {
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

    // Owner-only: Increase deadline
    pub fn increase_deadline(
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

    // Owner-only: Update fee percentage
    pub fn update_fee_percentage(
        ctx: Context<UpdateFeePercentage>,
        new_fee_percentage: u64,
    ) -> Result<()> {
        ctx.accounts.program_state.fee_percentage = new_fee_percentage;
        Ok(())
    }

    // Add voucher funds
    pub fn add_voucher_funds(ctx: Context<AddVoucherFunds>, amount: u64) -> Result<()> {
        require!(amount > 0, EventBettingProtocolError::BetAmountZero);

        // Update program state first
        ctx.accounts.program_state.accumulated_fees = ctx
            .accounts
            .program_state
            .accumulated_fees
            .checked_add(amount)
            .ok_or(EventBettingProtocolError::ArithmeticOverflow)?;

        // Transfer tokens from user to fee pool.
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.fee_pool.to_account_info(),
                    authority: ctx.accounts.fund_source.to_account_info(),
                },
            ),
            amount,
        )?;
        Ok(())
    }

    // Initialize user bet account
    pub fn initialize_user_bet(ctx: Context<InitializeUserBet>) -> Result<()> {
        let user_bet = &mut ctx.accounts.user_bet;
        user_bet.user = ctx.accounts.user.key();
        user_bet.event_id = ctx.accounts.event.id;
        user_bet.outcome = String::new();
        user_bet.amount = 0;
        user_bet.nonce = 0;
        Ok(())
    }

    // Owner-only: Update signer address
    pub fn update_signer(
        ctx: Context<UpdateSigner>,
        new_signer: Pubkey,
    ) -> Result<()> {
        ctx.accounts.program_state.signer = new_signer;
        Ok(())
    }

    // Owner-only: Update owner address
    pub fn update_owner(
        ctx: Context<UpdateOwner>,
        new_owner: Pubkey,
    ) -> Result<()> {
        ctx.accounts.program_state.owner = new_owner;
        Ok(())
    }

    // Initialize event pool
    pub fn initialize_event_pool(ctx: Context<InitializeEventPool>) -> Result<()> {
        Ok(())
    }
}

#[account]
pub struct ProgramState {
    pub fee_percentage: u64,
    pub signer: Pubkey, // Now stores Ed25519 public key
    pub owner: Pubkey,
    pub next_event_id: u64,
    pub accumulated_fees: u64,
    pub active_vouchers_amount: u64,
}

impl ProgramState {
    const LEN: usize = std::mem::size_of::<ProgramState>(); // or a custom length if desired
}

#[account]
pub struct Event {
    pub id: u64,
    pub description: String,
    pub start_time: i64,
    pub deadline: i64,
    pub possible_outcomes: Vec<String>,
    pub winning_outcome: Option<String>,
    pub total_pool: u64,
    pub voucher_amount: u64,
    pub total_voucher_claimed: u64,
    pub total_bets_by_outcome: Vec<u64>,
    pub resolved: bool,
}

#[account]
pub struct UserBet {
    pub user: Pubkey,
    pub event_id: u64,
    pub outcome: String,
    pub amount: u64,
    pub nonce: u64,
}

#[derive(Accounts)]
#[instruction(fee_percentage: u64, signer: Pubkey)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + ProgramState::LEN,
        seeds = [PROGRAM_AUTHORITY_SEED],
        bump
    )]
    pub program_authority: Account<'info, ProgramState>,

    #[account(
        init,
        payer = owner,
        space = 8 + ProgramState::LEN,
        seeds = [BETTING_STATE_SEED],
        bump
    )]
    pub program_state: Account<'info, ProgramState>,

    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct InitializeFeePool<'info> {
    #[account(
        init,
        payer = authority,
        seeds = [BETTING_STATE_SEED, FEE_POOL_SEED],
        bump,
        token::mint = token_mint,
        token::authority = program_authority
    )]
    pub fee_pool: Account<'info, TokenAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub program_state: Account<'info, ProgramState>,

    #[account(
        seeds = [PROGRAM_AUTHORITY_SEED],
        bump
    )]
    pub program_authority: Account<'info, ProgramState>,

    pub token_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct CreateEvent<'info> {
    #[account(mut, has_one = owner @ EventBettingProtocolError::Unauthorized)]
    pub program_state: Account<'info, ProgramState>,
    #[account(
        init,
        payer = owner,
        space = 8 + 8 + 1024 + (4 + 50 * 10) + 8 * 5, // Re-calculate space if needed for consistency and correctness
        seeds = [EVENT_SEED, &program_state.next_event_id.to_le_bytes()],
        bump
    )]
    pub event: Account<'info, Event>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PlaceBet<'info> {
    #[account(mut)]
    pub event: Account<'info, Event>,

    #[account(
        mut,
        seeds = [USER_BET_SEED, user.key().as_ref(), &event.id.to_le_bytes()],
        has_one = user,
        bump
    )]
    pub user_bet: Account<'info, UserBet>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [EVENT_SEED, &event.id.to_le_bytes(), b"pool"],
        bump,
        token::mint = user_token_account.mint,
        token::authority = event
    )]
    pub event_pool: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct PlaceBetWithVoucher<'info> {
    #[account(mut)]
    pub program_state: Account<'info, ProgramState>,

    // Retain admin_signer only for the voucher check.
    #[account(address = program_state.signer)]
    pub admin_signer: Option<Signer<'info>>,

    #[account(mut, seeds = [EVENT_SEED, &event.id.to_le_bytes()], bump)]
    pub event: Account<'info, Event>,

    #[account(mut, seeds = [USER_BET_SEED, user.key().as_ref(), &event.id.to_le_bytes()], bump)]
    pub user_bet: Account<'info, UserBet>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    // Added event_pool field
    #[account(mut, seeds = [EVENT_SEED, &event.id.to_le_bytes(), b"pool"], bump)]
    pub event_pool: Account<'info, TokenAccount>,

    #[account(mut, seeds = [BETTING_STATE_SEED, FEE_POOL_SEED], bump)]
    pub fee_pool: Account<'info, TokenAccount>,

    #[account(
        seeds = [PROGRAM_AUTHORITY_SEED],
        bump
    )]
    /// CHECK: Program authority is derived via seeds and used for signing CPI.
    pub program_authority: AccountInfo<'info>,

    #[account(signer)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ResolveEvent<'info> {
    #[account(mut)]
    pub program_state: Account<'info, ProgramState>,

    #[account(mut, seeds = [EVENT_SEED, &event.id.to_le_bytes()], bump)]
    pub event: Account<'info, Event>,

    #[account(
        seeds = [PROGRAM_AUTHORITY_SEED],
        bump
    )]
    /// CHECK: This PDA is derived from PROGRAM_AUTHORITY_SEED and is used solely for signing CPI calls.
    pub program_authority: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [EVENT_SEED, &event.id.to_le_bytes(), b"pool"],
        bump,
        token::mint = token_mint.key(),
        token::authority = event,
    )]
    pub event_pool: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [BETTING_STATE_SEED, FEE_POOL_SEED],
        bump,
        token::mint = token_mint.key(),
    )]
    pub fee_pool: Account<'info, TokenAccount>,

    pub token_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,

    #[account(mut)]
    pub owner: Signer<'info>,
}
#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    #[account(mut, seeds = [EVENT_SEED, &event.id.to_le_bytes()], bump)] // <--- Define event as PDA
    pub event: Account<'info, Event>,
    #[account(
        mut,
        seeds = [USER_BET_SEED, user.key().as_ref(), &event.id.to_le_bytes()], // Corrected seed
        has_one = user, // Important: Add the has_one constraint
        bump
    )]
    pub user_bet: Account<'info, UserBet>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [EVENT_SEED, &event.id.to_le_bytes(), b"pool"],
        bump,
        token::mint = user_token_account.mint, // Add mint constraint
        token::authority = event                // Authority is the event account
    )]
    pub event_pool: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateVoucherAmount<'info> {
    #[account(mut, has_one = owner @ EventBettingProtocolError::Unauthorized)]
    pub program_state: Account<'info, ProgramState>,
    #[account(mut)]
    pub event: Account<'info, Event>,
    #[account(mut)]
    pub owner: Signer<'info>, // Mark owner as mut for consistency, even if not mutated in this instruction
}

#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    #[account(mut, has_one = owner @ EventBettingProtocolError::Unauthorized)]
    pub program_state: Account<'info, ProgramState>,

    #[account(
        mut,
        seeds = [BETTING_STATE_SEED, FEE_POOL_SEED],
        bump,
        token::mint = owner_token_account.mint,
    )]
    pub fee_pool: Account<'info, TokenAccount>,
    #[account(mut)]
    pub owner_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [PROGRAM_AUTHORITY_SEED],
        bump
    )]
    pub program_authority: Account<'info, ProgramState>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    pub clock: Sysvar<'info, Clock>,
}
#[derive(Accounts)]
pub struct RevokeEvent<'info> {
    #[account(mut, has_one = owner @ EventBettingProtocolError::Unauthorized)]
    pub program_state: Account<'info, ProgramState>,
    #[account(mut)]
    pub event: Account<'info, Event>,
    #[account(mut)]
    pub owner: Signer<'info>, // Mark owner as mut for consistency
}

#[derive(Accounts)]
pub struct IncreaseDeadline<'info> {
    #[account(mut, has_one = owner @ EventBettingProtocolError::Unauthorized)]
    pub program_state: Account<'info, ProgramState>,
    #[account(mut)]
    pub event: Account<'info, Event>,
    #[account(mut)]
    pub owner: Signer<'info>, // Mark owner as mut for consistency
}

#[derive(Accounts)]
pub struct UpdateFeePercentage<'info> {
    #[account(mut, has_one = owner @ EventBettingProtocolError::Unauthorized)]
    pub program_state: Account<'info, ProgramState>,
    #[account(mut)]
    pub owner: Signer<'info>, // Mark owner as mut for consistency
}

#[derive(Accounts)]
pub struct AddVoucherFunds<'info> {
    #[account(
        mut,
        seeds = [BETTING_STATE_SEED],
        bump,
    )]
    pub program_state: Account<'info, ProgramState>, // Removed Box, not needed for Account<'info, T>

    #[account(
        mut,
        constraint = user_token_account.owner == fund_source.key()
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [BETTING_STATE_SEED, FEE_POOL_SEED],
        bump,
        token::mint = token_mint,
        token::authority = program_authority,
    )]
    pub fee_pool: Account<'info, TokenAccount>,

    #[account(mut)]
    pub fund_source: Signer<'info>,

    pub token_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,

    #[account(
        seeds = [PROGRAM_AUTHORITY_SEED],
        bump
    )]
    pub program_authority: Account<'info, ProgramState>,
}

#[derive(Accounts)]
pub struct InitializeUserBet<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + 32 + 8 + 50 + 8, // Re-calculate space if needed for consistency and correctness
        seeds = [
            USER_BET_SEED,
            user.key().as_ref(),
            &event.id.to_le_bytes()
        ],
        bump
    )]
    pub user_bet: Account<'info, UserBet>,
    #[account(mut)]
    pub event: Account<'info, Event>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateSigner<'info> {
    #[account(mut, has_one = owner @ EventBettingProtocolError::Unauthorized)]
    pub program_state: Account<'info, ProgramState>,
    #[account(mut)]
    pub owner: Signer<'info>, // Mark owner as mut for consistency
}

#[derive(Accounts)]
pub struct UpdateOwner<'info> {
    #[account(mut, has_one = owner @ EventBettingProtocolError::Unauthorized)]
    pub program_state: Account<'info, ProgramState>,
    #[account(mut)]
    pub owner: Signer<'info>, // Mark owner as mut for consistency
}

#[derive(Accounts)]
pub struct InitializeEventPool<'info> {
    #[account(mut)]
    pub event: Account<'info, Event>,

    #[account(
        init,
        payer = payer,
        seeds = [
            EVENT_SEED,
            &event.id.to_le_bytes(),
            b"pool"
        ],
        bump,
        token::mint = token_mint, // Initialize event_pool as TokenAccount with token_mint
        token::authority = event,    // Event PDA as authority
        //space = 8, // Remove space, TokenAccounts have fixed size
    )]
    pub event_pool: Account<'info, TokenAccount>, // Initialize event_pool as TokenAccount

    #[account(mut)]
    pub payer: Signer<'info>,
    pub token_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}