use anchor_lang::prelude::*;

#[error_code]
pub enum EventBettingProtocolError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid Ed25519 signature")]
    InvalidSignature,
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
    #[msg("Vouched amount cannot be zero")]
    VouchedAmountZero,
}
