# Solana Betting Program

A decentralized event betting platform built on Solana that allows users to create betting events, place bets on outcomes, and claim winnings.

## Program Overview

This program enables:
- Creating betting events with multiple possible outcomes
- Placing bets with both direct tokens and protocol-provided vouchers 
- Resolving events and distributing winnings based on bet proportions
- Protocol fee collection and management
- Comprehensive administrative controls

## Core Functions

### Program Initialization and Management

#### `initialize`
- **Purpose**: Initializes the betting protocol with its core parameters
- **Parameters**: 
  - `fee_percentage`: Protocol fee percentage (basis points, e.g., 1000 = 10%)
  - `signer`: Authority that can sign for voucher-based bets
  - `token_mint`: SPL token used for all protocol operations
- **Creates**: Program state account and fee pool token account

#### `update_config`
- **Purpose**: Updates protocol configuration parameters
- **Parameters**:
  - `new_owner`: Optional new owner address
  - `new_signer`: Optional new admin signer address
  - `new_fee_percentage`: Optional new fee percentage
- **Access**: Owner only

### Event Management

#### `create_event`
- **Purpose**: Creates a new betting event with defined parameters
- **Parameters**:
  - `description`: Text description of the event
  - `start_time`: Timestamp when betting can start
  - `deadline`: Timestamp when betting ends
  - `possible_outcomes`: List of possible outcomes to bet on
  - `voucher_amount`: Amount of protocol vouchers allocated to this event
- **Creates**: Event account and event token pool
- **Access**: Owner only

#### `update_voucher_amount`
- **Purpose**: Adjusts voucher allocation for an event
- **Parameters**:
  - `new_voucher_amount`: Updated amount of vouchers allocated
- **Access**: Owner only
- **Constraints**: Event must not be resolved, new amount must be >= claimed vouchers

#### `increase_deadline`
- **Purpose**: Extends the deadline of an active event
- **Parameters**:
  - `new_deadline`: New (later) deadline timestamp
- **Access**: Owner only
- **Constraints**: New deadline must be after current deadline

#### `revoke_event`
- **Purpose**: Cancels an event before it starts
- **Access**: Owner only
- **Constraints**: Event must not have started, no bets placed

#### `resolve_event`
- **Purpose**: Concludes an event by setting the winning outcome
- **Parameters**:
  - `winning_outcome`: The outcome determined to be the winner
- **Effects**: Applies protocol fee, returns unused vouchers, prepares for winner claims
- **Access**: Owner only
- **Constraints**: Event deadline must have passed, event not already resolved

### Betting Functions

#### `place_bet`
- **Purpose**: Places a bet on a specific outcome of an event
- **Parameters**:
  - `outcome`: The outcome being bet on
  - `amount`: User token amount being wagered
  - `vouched_amount`: Protocol voucher amount being used (if any)
- **Effects**: Transfers bet amount to event pool, records user's bet
- **Constraints**: Event must be active, sufficient funds/vouchers

#### `claim_winnings`
- **Purpose**: Allows winners to claim their proportional share of the prize pool
- **Effects**: Calculates and transfers winnings to user
- **Constraints**: Event must be resolved, user must have bet on winning outcome

#### `close_user_bet`
- **Purpose**: Closes a user bet account after claiming winnings
- **Effects**: Reclaims rent from the user bet account
- **Constraints**: User bet amount must be zero (already claimed/lost)

### Financial Management

#### `add_voucher_funds`
- **Purpose**: Adds funds to the protocol's voucher system
- **Parameters**:
  - `amount`: Amount of tokens to add as voucher funds
- **Effects**: Transfers tokens to fee pool, increases accumulated fees

#### `withdraw_fees`
- **Purpose**: Withdraws collected protocol fees
- **Parameters**:
  - `amount`: Amount of tokens to withdraw
- **Access**: Owner only
- **Constraints**: Can only withdraw up to (accumulated_fees - active_vouchers_amount)

## Account Structures

### `ProgramState`
Central protocol configuration storing:
- Fee percentage
- Protocol admin signer
- Owner address
- Event counter
- Fee accounting
- Token mint

### `Event`
Represents a betting event with:
- Event ID and description
- Possible outcomes and winner
- Timing parameters
- Pool and voucher accounting
- Resolution status

### `UserBet`
Records a user's bet with:
- User pubkey
- Event ID
- Selected outcome
- Bet amount

## Security Features

- **Access Controls**: Function-level owner and signer checks
- **Mathematical Safety**: Use of checked math to prevent overflows
- **Time-based Guards**: Prevents betting before start or after deadline
- **Financial Safety**: Checks for sufficient funds and prevents double-spending
- **Outcome Validation**: Ensures bets and resolutions use valid outcomes
