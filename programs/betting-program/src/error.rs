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
    #[msg("Betting not started")]
    BettingNotStarted,
    #[msg("The user token account is not the expected associated token account.")]
    InvalidUserATA,
    #[msg("The fee pool account is not the expected associated token account.")]
    InvalidFeePoolATA,  
}
