use anchor_lang::prelude::*;

#[error_code]
pub enum EventBettingProtocolError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid Ed25519 signature")]
    InvalidSignature,
    #[msg("Deadline must be in the future")]
    DeadlineInThePast,
    #[msg("Start time must be in the future")]
    StartTimeInThePast,
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
    #[msg("Invalid winning outcome")]
    InvalidWinningOutcome,
    #[msg("Event is still active")]
    EventStillActive,
    #[msg("Event already resolved")]
    EventAlreadyResolved,
    #[msg("Event not resolved yet")]
    EventNotResolvedYet,
    #[msg("No winnings to claim")]
    NoWinningsToClaim,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
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
    #[msg("Vouched amount cannot be zero")]
    VouchedAmountZero,
    #[msg("Betting not started")]
    BettingNotStarted,
    #[msg("The provided token mint is invalid.")]
    InvalidTokenMint,
    #[msg("The user token account is not the expected associated token account.")]
    InvalidUserATA,
    #[msg("The fee pool account is not the expected associated token account.")]
    InvalidFeePoolATA,
    #[msg("The event pool account is not the expected associated token account.")]
    InvalidEventPoolATA,
}