#!/bin/bash
set -e

echo "Deploying Betting Program to Solana Testnet..."

# Configure for testnet
solana config set --url https://api.testnet.solana.com

# Check if keypair exists, generate if not
KEYPAIR_PATH="/home/xyz/solana/betting-program/deploy-keypair.json"
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
  echo "1. Try testnet airdrop (might fail due to rate limits)"
  echo "2. Fund from your default wallet ($(solana address))"
  echo "3. Continue with low balance anyway (risky)"
  echo "4. Exit to fund manually"
  echo ""
  read -p "Choose an option (1-4): " FUND_OPTION
  
  case $FUND_OPTION in
    1)
      echo "Attempting airdrop..."
      # Try only reliable endpoints
      ENDPOINTS=("https://api.testnet.solana.com" "https://testnet.solana.com")
      for ENDPOINT in "${ENDPOINTS[@]}"; do
        echo "Trying endpoint: $ENDPOINT"
        solana config set --url $ENDPOINT
        if solana airdrop 2 "$PROGRAM_ID"; then
          echo "Airdrop successful!"
          sleep 5
          BALANCE=$(solana balance "$PROGRAM_ID" 2>/dev/null | awk '{print $1}' || echo "0")
          echo "New balance: $BALANCE SOL"
          # Reset to default testnet endpoint
          solana config set --url https://api.testnet.solana.com
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

# Update program ID in lib.rs
echo "Updating program ID in lib.rs to: $PROGRAM_ID"
sed -i "s|declare_id!(\"[^\"]*\")|declare_id!(\"$PROGRAM_ID\")|" /home/xyz/solana/betting-program/programs/betting-program/src/lib.rs

# Build the program
echo "Building program..."
anchor build

# Deploy to testnet
echo "Deploying to testnet..."
anchor deploy --provider.cluster testnet --provider.wallet "$KEYPAIR_PATH"

echo "Deployment complete!"
echo "Verifying program information..."
solana program show "$PROGRAM_ID"

echo "Done! Your program is now deployed on Solana testnet."
echo "Program ID: $PROGRAM_ID"
