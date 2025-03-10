use anchor_lang::prelude::*;

#[error_code]
pub enum EventBettingProtocolError {
    #[msg("Deadline must be after the start time.")]
    DeadlineInThePast,
    #[msg("Start time must be in the future.")]
    StartTimeInThePast,
    #[msg("No outcomes were specified for the event.")]
    NoOutcomesSpecified,
    #[msg("Arithmetic operation overflowed.")]
    ArithmeticOverflow,
    #[msg("Insufficient protocol fees for voucher allocation.")]
    InsufficientProtocolFees,
    #[msg("Unauthorized access.")]
    Unauthorized,
    #[msg("Bet amount must be greater than zero.")]
    BetAmountZero,
    #[msg("Token mint does not match the program state token mint.")]
    InvalidTokenMint,
    #[msg("User token account is not the expected associated token account.")]
    InvalidUserATA,
    #[msg("Fee pool account is invalid.")]
    InvalidFeePoolATA,
    #[msg("Insufficient fees available.")]
    InsufficientFees,
    #[msg("Event cannot be ended as it has already started or resolved.")]
    EventCannotBeEnded,
    #[msg("Event already has bets placed.")]
    EventHasBets,
    #[msg("Event is still active and cannot be resolved.")]
    EventStillActive,
    #[msg("Event has already been resolved.")]
    EventAlreadyResolved,
    #[msg("Betting has not started yet.")]
    BettingNotStarted,
    #[msg("Betting is closed.")]
    BettingClosed,
    #[msg("Invalid outcome specified.")]
    InvalidOutcome,
    #[msg("Invalid admin signature provided.")]
    InvalidSignature,
    #[msg("Voucher amount cannot be updated for a resolved event.")]
    VoucherUpdateNotAllowed,
    #[msg("New voucher amount is less than already claimed vouchers.")]
    InsufficientVoucherAmount,
    #[msg("Invalid winning outcome specified.")]
    InvalidWinningOutcome,
}