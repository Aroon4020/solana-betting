#!/bin/bash
set -e

# Load environment variables if .env exists
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Use environment variables or fallback to defaults
NETWORK=${SOLANA_NETWORK:-devnet}
RPC_URL=${RPC_URL:-https://api.devnet.solana.com}
KEYPAIR_PATH=${WALLET_PATH:-"/home/xyz/solana/betting-program/deploy-keypair.json"}

echo "Deploying Betting Program to Solana $NETWORK..."
solana config set --url $RPC_URL

# Check if keypair exists, generate if not
if [ ! -f "$KEYPAIR_PATH" ]; then
  echo "Generating new keypair at $KEYPAIR_PATH"
  solana-keygen new --outfile "$KEYPAIR_PATH" --no-bip39-passphrase --silent
fi

# Get the program ID (public key)
PROGRAM_ID=$(solana address -k "$KEYPAIR_PATH")
echo "Using program ID: $PROGRAM_ID"

# Check balance
BALANCE=$(solana balance "$PROGRAM_ID" 2>/dev/null | awk '{print $1}' || echo "0")
echo "Current balance: $BALANCE SOL"

# Set required balance threshold (program deployment needs ~3.3 SOL)
REQUIRED_BALANCE=3.5

if (( $(echo "$BALANCE < $REQUIRED_BALANCE" | bc -l) )); then
  echo "Balance too low for deployment. Need at least $REQUIRED_BALANCE SOL"
  echo ""
  echo "=== FUNDING OPTIONS ==="
  echo "1. Try devnet airdrop (might fail due to rate limits)"
  echo "2. Fund from your default wallet ($(solana address))"
  echo "3. Continue with low balance anyway (risky)"
  echo "4. Exit to fund manually"
  echo ""
  read -p "Choose an option (1-4): " FUND_OPTION
  
  case $FUND_OPTION in
    1)
      echo "Attempting airdrop..."
      ENDPOINTS=("https://api.devnet.solana.com")
      for ENDPOINT in "${ENDPOINTS[@]}"; do
        echo "Trying endpoint: $ENDPOINT"
        solana config set --url $ENDPOINT
        if solana airdrop 2 "$PROGRAM_ID"; then
          echo "Airdrop successful!"
          sleep 5
          BALANCE=$(solana balance "$PROGRAM_ID" 2>/dev/null | awk '{print $1}' || echo "0")
          echo "New balance: $BALANCE SOL"
          solana config set --url https://api.devnet.solana.com
          break
        else
          echo "Airdrop failed on $ENDPOINT, trying next..."
        fi
      done
      ;;
    2)
      read -p "How much SOL to transfer? (min $REQUIRED_BALANCE): " TRANSFER_AMOUNT
      echo "Transferring $TRANSFER_AMOUNT SOL from your default wallet to deployment keypair..."
      solana transfer --allow-unfunded-recipient "$PROGRAM_ID" "$TRANSFER_AMOUNT"
      sleep 5
      BALANCE=$(solana balance "$PROGRAM_ID" | awk '{print $1}')
      echo "New balance: $BALANCE SOL"
      ;;
    3)
      echo "Continuing with low balance. Deployment may fail."
      ;;
    4)
      echo ""
      echo "Please fund the program account manually with at least $REQUIRED_BALANCE SOL"
      echo "Program ID to fund: $PROGRAM_ID"
      echo ""
      echo "After funding, run this script again."
      exit 0
      ;;
  esac
fi

# Check again if balance is sufficient
BALANCE=$(solana balance "$PROGRAM_ID" | awk '{print $1}')
if (( $(echo "$BALANCE < $REQUIRED_BALANCE" | bc -l) )); then
  echo "Warning: Balance still insufficient ($BALANCE SOL). Proceed with caution."
  read -p "Continue anyway? (y/n): " CONTINUE
  if [[ $CONTINUE != "y" && $CONTINUE != "Y" ]]; then
    echo "Deployment cancelled."
    exit 1
  fi
fi

# Update program ID in lib.rs - this is critical
echo "Updating program ID in lib.rs to: $PROGRAM_ID"
sed -i "s|declare_id!(\"[^\"]*\")|declare_id!(\"$PROGRAM_ID\")|" /home/xyz/solana/betting-program/programs/betting-program/src/lib.rs

# Verify the program ID was correctly updated in lib.rs
UPDATED_ID=$(grep -o 'declare_id!("[^"]*")' /home/xyz/solana/betting-program/programs/betting-program/src/lib.rs | cut -d'"' -f2)
if [ "$UPDATED_ID" != "$PROGRAM_ID" ]; then
  echo "ERROR: Failed to update program ID in lib.rs. Please update manually to: $PROGRAM_ID"
  exit 1
fi
echo "Program ID in lib.rs correctly set to: $UPDATED_ID"

# Build the program
echo "Building program..."
anchor build

# Double check the on-chain program ID before deploying
ON_CHAIN_ID=$(solana program show "$PROGRAM_ID" 2>/dev/null | grep "Program Id:" | awk '{print $3}' || echo "")
if [ -n "$ON_CHAIN_ID" ]; then
  echo "Warning: Program already exists at $PROGRAM_ID"
  echo "Proceeding with upgrade..."
fi

# Deploy to devnet
echo "Deploying to devnet..."
DEPLOY_OUTPUT=$(anchor deploy --provider.cluster devnet --provider.wallet "$KEYPAIR_PATH" 2>&1)
echo "$DEPLOY_OUTPUT"

# Extract the actual deployed Program ID from the output
DEPLOYED_PROGRAM_ID=$(echo "$DEPLOY_OUTPUT" | grep -oP 'Program Id: \K[a-zA-Z0-9]{32,}' || echo "$PROGRAM_ID")

echo "Deployment complete!"
echo "Verifying program information..."
solana program show "$DEPLOYED_PROGRAM_ID"

# Update lib.rs again with the actual deployed Program ID if different
if [ "$DEPLOYED_PROGRAM_ID" != "$PROGRAM_ID" ]; then
  echo "WARNING: Deployed program ID ($DEPLOYED_PROGRAM_ID) differs from keypair ID ($PROGRAM_ID)"
  echo "Updating lib.rs with actual deployed Program ID: $DEPLOYED_PROGRAM_ID"
  sed -i "s|declare_id!(\"[^\"]*\")|declare_id!(\"$DEPLOYED_PROGRAM_ID\")|" /home/xyz/solana/betting-program/programs/betting-program/src/lib.rs
  
  # Rebuild with correct ID if needed for future deployments
  echo "Rebuilding with correct program ID..."
  anchor build
fi

echo "Done! Your program is now deployed on Solana devnet."
echo "Program ID: $DEPLOYED_PROGRAM_ID"
