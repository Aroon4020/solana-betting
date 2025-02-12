use anchor_lang::prelude::*;
use anchor_lang::solana_program::secp256k1_recover::secp256k1_recover;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};
use sha3::{Digest, Keccak256};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

// Constants and seeds
pub const BETTING_STATE_SEED: &[u8] = b"program_state";
pub const EVENT_SEED: &[u8] = b"event";
pub const USER_BET_SEED: &[u8] = b"user_bet";
pub const USER_SEED: &[u8] = b"user";
pub const FEE_POOL_SEED: &[u8] = b"fee_pool";
pub const PROGRAM_AUTHORITY_SEED: &[u8] = b"program_authority";

#[program]
pub mod event_betting {
    use super::*;

    // Initialize program state
    pub fn initialize(
        ctx: Context<Initialize>,
        fee_percentage: u64,
        signer: Pubkey, // Ethereum address stored as 32-byte Pubkey
    ) -> Result<()> {
        let program_state = &mut ctx.accounts.program_state;
        program_state.fee_percentage = fee_percentage;
        program_state.signer = signer;
        program_state.owner = ctx.accounts.owner.key();
        program_state.next_event_id = 0;
        program_state.accumulated_fees = 0;
        program_state.active_vouchers_amount = 0;
        Ok(())
    }

    // Initialize user account (PDA)
    pub fn initialize_user(ctx: Context<InitializeUser>) -> Result<()> {
        let user_account = &mut ctx.accounts.user;
        user_account.nonce = 0;
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
        let program_state = &mut ctx.accounts.program_state;
        let event = &mut ctx.accounts.event;

        require!(deadline > start_time, ErrorCode::DeadlineInThePast);
        require!(!possible_outcomes.is_empty(), ErrorCode::NoOutcomesSpecified);
        require!(
            program_state.accumulated_fees >= program_state.active_vouchers_amount + voucher_amount,
            ErrorCode::InsufficientProtocolFees
        );

        // Get event ID *before* the mutable borrow
        let event_id = program_state.next_event_id;

        let event = &mut ctx.accounts.event;  // Now the mutable borrow

        let clock = Clock::get()?;
        require!(start_time > clock.unix_timestamp, ErrorCode::DeadlineInThePast);
        require!(deadline > start_time, ErrorCode::DeadlineInThePast);
        require!(!possible_outcomes.is_empty(), ErrorCode::NoOutcomesSpecified);
        require!(
            program_state.accumulated_fees >= program_state.active_vouchers_amount + voucher_amount,
            ErrorCode::InsufficientProtocolFees
        );

        event.id = event_id;
        event.resolved = false;
        event.description = description;
        event.start_time = start_time;
        event.deadline = deadline;
        event.possible_outcomes = possible_outcomes.clone();
        event.voucher_amount = voucher_amount;
        event.total_voucher_claimed = 0;
        event.total_pool = 0;
        event.winning_outcome = None;
        event.total_bets_by_outcome = vec![0u64; possible_outcomes.len()];

        program_state.next_event_id = program_state.next_event_id.checked_add(1).unwrap();
        program_state.active_vouchers_amount = program_state.active_vouchers_amount
            .checked_add(voucher_amount)
            .unwrap();
        let (pool_pda, _) = Pubkey::find_program_address(
            &[EVENT_SEED, &event_id.to_le_bytes(), b"pool"], // Use the saved ID
            &crate::ID
        );
        Ok(())
    }

    pub fn initialize_fee_pool(ctx: Context<InitializeFeePool>) -> Result<()> {
        require!(
            ctx.accounts.program_state.owner == ctx.accounts.authority.key(),
            ErrorCode::Unauthorized
        );
        Ok(())
    }

    // Place standard bet
    pub fn place_bet(
        ctx: Context<PlaceBet>,
        outcome: String,
        amount: u64,
    ) -> Result<()> {
        // In program

        let event = &mut ctx.accounts.event;
        let user_bet = &mut ctx.accounts.user_bet;
        let clock = Clock::get()?;

        require!(amount > 0, ErrorCode::BetAmountZero);
        require!(clock.unix_timestamp < event.deadline, ErrorCode::BettingClosed);

        let outcome_index = event.possible_outcomes.iter()
            .position(|x| x == &outcome)
            .ok_or(ErrorCode::InvalidOutcome)?;

        event.total_bets_by_outcome[outcome_index] = event.total_bets_by_outcome[outcome_index]
            .checked_add(amount)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

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

        if user_bet.outcome.is_empty() {   // Removed unnecessary parentheses
            user_bet.outcome = outcome.clone();
        } else {
            require!(user_bet.outcome == outcome, ErrorCode::InvalidOutcome);
        }

        user_bet.amount = user_bet.amount.checked_add(amount).unwrap();
        event.total_pool = event.total_pool.checked_add(amount).unwrap();

        Ok(())
    }




    pub fn resolve_event(ctx: Context<ResolveEvent>, winning_outcome: String) -> Result<()> {
        let event = &mut ctx.accounts.event;
        let event_pool = &ctx.accounts.event_pool;
        let fee_pool = &ctx.accounts.fee_pool;
        let program_state = &mut ctx.accounts.program_state;
    
        msg!("Resolve Event Instruction Called");
        msg!("  Owner Signer (ctx.accounts.owner.key()): {:?}", ctx.accounts.owner.key());
        msg!("  Program State Owner (program_state.owner): {:?}", program_state.owner);
    
    
        require!(
            program_state.owner == ctx.accounts.owner.key(),
            ErrorCode::Unauthorized
        );
    
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp >= event.deadline,
            ErrorCode::EventStillActive
        );
        require!(!event.resolved, ErrorCode::EventAlreadyResolved);
    
        let winning_outcome_index = event.possible_outcomes.iter()
            .position(|x| x == &winning_outcome)
            .ok_or(ErrorCode::InvalidWinningOutcome)?;
    
        let total_event_pool_amount = token::accessor::amount(&event_pool.to_account_info())?;
        let fee = (total_event_pool_amount as u128)
            .checked_mul(program_state.fee_percentage as u128)
            .unwrap()
            .checked_div(10000)
            .unwrap() as u64;
    
        event.resolved = true;
        event.winning_outcome = Some(winning_outcome.clone());
    
        let (program_authority_pda, bump) = Pubkey::find_program_address(
            &[PROGRAM_AUTHORITY_SEED],
            ctx.program_id
        );
        // In program's resolve_event function:
        msg!("  Program Authority PDA (derived): {:?}", program_authority_pda);
        msg!("  Program Authority Account (passed): {:?}", ctx.accounts.program_authority.key());
    
    
        // Corrected signer seeds for EVENT PDA
        let event_signer_seeds = &[
            &EVENT_SEED[..],
            &event.id.to_le_bytes()[..],
            &[ctx.bumps.event], // Use event bump
        ];
        let signer: &[&[&[u8]]] = &[event_signer_seeds];
    
    
        msg!("  Event Pool Token Account (from): {:?}", ctx.accounts.event_pool.key());
        msg!("  Fee Pool Token Account (to): {:?}", ctx.accounts.fee_pool.key());
        msg!("  Event PDA (authority): {:?}", ctx.accounts.event.key()); // <---- Log Event PDA as authority
    
    
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.event_pool.to_account_info(),
                    to: ctx.accounts.fee_pool.to_account_info(),
                    authority: ctx.accounts.event.to_account_info(), // <---- Use event PDA as authority
                },
                signer, // <---- Use event PDA signer seeds
            ),
            fee,
        )?;
    
        program_state.accumulated_fees = program_state.accumulated_fees
            .checked_add(fee)
            .unwrap();
    
        Ok(())
    }


    // Claim winnings
    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        let event = &ctx.accounts.event;
        let user_bet = &mut ctx.accounts.user_bet;

        let winning_outcome = event.winning_outcome.as_ref().ok_or(ErrorCode::EventNotResolvedYet)?;
        require!(winning_outcome == &user_bet.outcome, ErrorCode::InvalidOutcome);
        require!(user_bet.amount > 0, ErrorCode::NoWinningsToClaim);

        let winning_index = event.possible_outcomes.iter()
            .position(|x| x == winning_outcome)
            .ok_or(ErrorCode::InvalidOutcome)?;

        let total_winning_bets = event.total_bets_by_outcome[winning_index];

        let total_pool_after_fees = event.total_pool;

        let payout = total_pool_after_fees
            .checked_mul(user_bet.amount)
            .and_then(|v| v.checked_div(total_winning_bets))
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        let signer_seeds = &[
            EVENT_SEED,
            &ctx.accounts.event.id.to_le_bytes(),
            &[ctx.bumps.event], // Corrected: Use event bump
        ];
        let signer: &[&[&[u8]]] = &[signer_seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.event_pool.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.event.to_account_info(), // Event PDA signs
                },
                signer,
            ),
            payout,
        )?;

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

        require!(event.winning_outcome.is_none(), ErrorCode::VoucherUpdateNotAllowed);
        require!(new_voucher_amount >= event.total_voucher_claimed, ErrorCode::InsufficientVoucherAmount);

        let delta = new_voucher_amount.checked_sub(event.voucher_amount).unwrap();
        program_state.active_vouchers_amount = program_state.active_vouchers_amount
            .checked_add(delta)
            .unwrap();
        event.voucher_amount = new_voucher_amount;

        Ok(())
    }

    // Owner-only: Withdraw fees
    pub fn withdraw_fees(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
        require!(amount != 0, ErrorCode::WithdrawAmountZero);
        let state = &mut ctx.accounts.program_state;

        // Ensure the caller is the owner
        require!(ctx.accounts.owner.key() == state.owner, ErrorCode::Unauthorized);

        // Ensure enough fees have been accumulated
        state.accumulated_fees = state.accumulated_fees
            .checked_sub(amount)
            .ok_or(ErrorCode::InsufficientFees)?;

            let cpi_accounts = Transfer {
                from: ctx.accounts.fee_pool.to_account_info(),
                to: ctx.accounts.owner_token_account.to_account_info(),
                authority: ctx.accounts.program_authority.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
    
            let signer_seeds: &[&[&[u8]]] = &[
                &[
                    PROGRAM_AUTHORITY_SEED,
                    &[ctx.bumps.program_authority],
                ],
            ];
    
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
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
            ErrorCode::Unauthorized
        );

        require!(
            clock.unix_timestamp < event.start_time,
            ErrorCode::EventCannotBeEnded
        );

        require!(event.total_pool == 0, ErrorCode::EventHasBets);

        // Get the voucher amount before zeroing it
        let voucher_amount = event.voucher_amount;

        // Set event voucher amount to 0 first
        event.voucher_amount = 0;

        // Update accumulated fees and active vouchers
        if voucher_amount > 0 {
            program_state.active_vouchers_amount = program_state
                .active_vouchers_amount
                .checked_sub(voucher_amount)
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
        let current_deadline = event.deadline;
        require!(new_deadline > current_deadline, ErrorCode::DeadlineInThePast);
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

        ctx.accounts.program_state.accumulated_fees = ctx.accounts.program_state.accumulated_fees
            .checked_add(amount)
            .unwrap();

        Ok(())
    }

    // Initialize user bet account
    pub fn initialize_user_bet(ctx: Context<InitializeUserBet>) -> Result<()> {
        let user_bet = &mut ctx.accounts.user_bet;
        user_bet.user = ctx.accounts.user.key();
        user_bet.event_id = ctx.accounts.event.id;
        user_bet.outcome = String::new();
        user_bet.amount = 0;
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

// ====================
// Data Structures
// ====================
#[account]
pub struct ProgramState {
    pub fee_percentage: u64,
    pub signer: Pubkey, // Ethereum address (20 bytes + 12 zero padding)
    pub owner: Pubkey,
    pub next_event_id: u64,
    pub accumulated_fees: u64,
    pub active_vouchers_amount: u64,
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
}

#[account]
pub struct User {
    pub nonce: u64,
}

// ====================
// Error Codes
// ====================
#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Deadline must be in the future")]
    DeadlineInThePast,
    #[msg("No outcomes specified")]
    NoOutcomesSpecified,
    #[msg("Insufficient protocol fees")]
    InsufficientProtocolFees,
    #[msg("Bet amount must be greater than zero")]
    BetAmountZero,
    #[msg("Betting is closed")]
    BettingClosed,
    #[msg("Invalid outcome")]
    InvalidOutcome,
    #[msg("Event is still active")]
    InvalidWinningOutcome,
    EventStillActive,
    #[msg("Event already resolved")]
    EventAlreadyResolved,
    #[msg("Event not resolved yet")]
    EventNotResolvedYet,
    #[msg("No winnings to claim")]
    NoWinningsToClaim,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Invalid signature")]
    InvalidSignature,
    #[msg("Invalid nonce")]
    InvalidNonce,
    #[msg("Voucher amount exceeds limit")]
    VoucherAmountExceedsLimit,
    #[msg("WithdrawAmountZero")]
    WithdrawAmountZero,
    #[msg("Insufficient fees for withdrawal")]
    InsufficientFees,
    #[msg("Voucher update not allowed after resolution")]
    VoucherUpdateNotAllowed,
    #[msg("Insufficient voucher amount")]
    InsufficientVoucherAmount,
    #[msg("Event cannot be ended")]
    EventCannotBeEnded,
    #[msg("Event has active bets")]
    EventHasBets,
}

// ====================
// Contexts
// ====================
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + std::mem::size_of::<ProgramState>(), // Correct space calculation
        seeds = [PROGRAM_AUTHORITY_SEED],
        bump,
    )]
    pub program_authority: Account<'info, ProgramState>, // The PDA

    #[account(
        init,
        payer = owner,
        space = 8 + std::mem::size_of::<ProgramState>(),
        seeds = [BETTING_STATE_SEED],
        bump
    )]
    pub program_state: Account<'info, ProgramState>,

    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>, // Add rent sysvar for proper initialization
}

#[derive(Accounts)]
pub struct InitializeFeePool<'info> {
    #[account(
        init,
        payer = authority,
        seeds = [BETTING_STATE_SEED, FEE_POOL_SEED],
        bump,
        token::mint = token_mint,
        token::authority = program_authority, // <---- NOW program_authority IS VALID
        token::token_program = token_program,
    )]
    pub fee_pool: Account<'info, TokenAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut, seeds = [BETTING_STATE_SEED], bump)]
    pub program_state: Account<'info, ProgramState>,

    #[account(
        seeds = [PROGRAM_AUTHORITY_SEED], // Seeds for program_authority PDA
        bump,
    )]
    pub program_authority: Account<'info, ProgramState>, // <---- ADD program_authority ACCOUNT HERE

    pub token_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}
#[derive(Accounts)]
pub struct InitializeUser<'info> {
    #[account(
        init,
        payer = user_signer,
        space = 8 + 8,
        seeds = [USER_SEED, user_signer.key().as_ref()],
        bump
    )]
    pub user: Account<'info, User>,
    #[account(mut)]
    pub user_signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateEvent<'info> {
    #[account(mut, has_one = owner @ ErrorCode::Unauthorized)]
    pub program_state: Account<'info, ProgramState>,
    #[account(
        init,
        payer = owner,
        space = 8 + 8 + 1024 + (4 + 50 * 10) + 8*5,
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
pub struct ResolveEvent<'info> {
    #[account(mut)]
    pub program_state: Account<'info, ProgramState>,
    
    #[account(mut, seeds = [EVENT_SEED, &event.id.to_le_bytes()], bump)]
    pub event: Account<'info, Event>,
    
    #[account(
        seeds = [PROGRAM_AUTHORITY_SEED],
        bump,
        // Add this if needed:
        // token::mint = token_mint.key(),
        // token::authority = program_authority
    )]
    /// CHECK: PDA validated by seeds
    pub program_authority: UncheckedAccount<'info>,
    
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
        token::authority = event // Authority is the event account
    )]
    pub event_pool: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateVoucherAmount<'info> {
    #[account(mut, has_one = owner @ ErrorCode::Unauthorized)]
    pub program_state: Account<'info, ProgramState>,
    #[account(mut)]
    pub event: Account<'info, Event>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    #[account(mut, has_one = owner @ ErrorCode::Unauthorized)]
    pub program_state: Account<'info, ProgramState>,

    #[account(
        mut,
        seeds = [BETTING_STATE_SEED, FEE_POOL_SEED], // Correct seed `FEE_POOL_SEED`
        bump,
        token::mint = owner_token_account.mint,
    )]
    pub fee_pool: Account<'info, TokenAccount>, // Correctly named 'fee_pool', the PDA Token Account
    #[account(mut)]
    pub owner_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [PROGRAM_AUTHORITY_SEED],
        bump,
    )]
    pub program_authority: Account<'info, ProgramState>, // Program Authority PDA

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    pub clock: Sysvar<'info, Clock>,
}
#[derive(Accounts)]
pub struct RevokeEvent<'info> {
    #[account(mut, has_one = owner @ ErrorCode::Unauthorized)]
    pub program_state: Account<'info, ProgramState>,
    #[account(mut)]
    pub event: Account<'info, Event>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct IncreaseDeadline<'info> {
    #[account(mut, has_one = owner @ ErrorCode::Unauthorized)]
    pub program_state: Account<'info, ProgramState>,
    #[account(mut)]
    pub event: Account<'info, Event>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateFeePercentage<'info> {
    #[account(mut, has_one = owner @ ErrorCode::Unauthorized)]
    pub program_state: Account<'info, ProgramState>,
    pub owner: Signer<'info>,
}


#[derive(Accounts)]
pub struct AddVoucherFunds<'info> {
    #[account(mut, seeds = [BETTING_STATE_SEED], bump)]
    pub program_state: Account<'info, ProgramState>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [BETTING_STATE_SEED, b"fee_pool"],
        bump,
        token::mint = user_token_account.mint,
    )]
    pub fee_pool: Account<'info, TokenAccount>,

    #[account(signer)]
    pub fund_source: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct InitializeUserBet<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + 32 + 8 + 50 + 8,
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
    #[account(mut, has_one = owner @ ErrorCode::Unauthorized)]
    pub program_state: Account<'info, ProgramState>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateOwner<'info> {
    #[account(mut, has_one = owner @ ErrorCode::Unauthorized)]
    pub program_state: Account<'info, ProgramState>,
    pub owner: Signer<'info>,
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
        token::authority = event, // Event PDA as authority
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