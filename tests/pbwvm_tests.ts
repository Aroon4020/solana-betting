// import { EventBetting } from '../target/types/event_betting';
// import { PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
// import {
//   createMint,
//   createAssociatedTokenAccount,
//   mintTo,
//   getOrCreateAssociatedTokenAccount,
//   TOKEN_PROGRAM_ID,
//   ASSOCIATED_TOKEN_PROGRAM_ID
// } from '@solana/spl-token';
// import { ed25519 } from '@noble/curves/ed25519';
// import * as anchor from "@coral-xyz/anchor";
// import { Program } from "@coral-xyz/anchor";
// import { assert } from "chai";

// describe('event_betting', () => {
//   const provider = anchor.AnchorProvider.env();
//   anchor.setProvider(provider);
//   const program = anchor.workspace.EventBetting as Program<EventBetting>;

//   // Keypairs
//   const authority = Keypair.generate();
//   const admin = Keypair.generate();
//   const user = Keypair.generate();

//   // State addresses
//   let mint: PublicKey;
//   let programState: PublicKey;
//   let feePool: PublicKey;
//   let eventPda: PublicKey;
//   let eventPool: PublicKey;
//   let userBetPda: PublicKey;
//   let userTokenAccount: PublicKey;

//   // Test parameters
//   const eventId = 0;
//   const voucherAmount = 1000;
//   const userDeposit = 500;
//   const totalBet = voucherAmount + userDeposit;
//   const fundAmount = 1000000;

//   before(async () => {
//     console.log('🚀 Starting test setup...');

//     // Fund accounts
//     console.log('💰 Funding admin and user accounts...');
//     const airdropTxs = await Promise.all([
//       provider.connection.requestAirdrop(admin.publicKey, 10000000000),
//       provider.connection.requestAirdrop(user.publicKey, 10000000000),
//     ]);

//     // Confirm transactions
//     await Promise.all(airdropTxs.map(async (signature) => {
//       const latestBlockHash = await provider.connection.getLatestBlockhash();
//       await provider.connection.confirmTransaction({
//         signature,
//         blockhash: latestBlockHash.blockhash,
//         lastValidBlockHeight: latestBlockHash.lastValidBlockHeight
//       }, 'confirmed');
//     }));

//     // Initialize program
//     [programState] = PublicKey.findProgramAddressSync(
//       [Buffer.from('program_state')],
//       program.programId
//     );

//     console.log('⚙️ Initializing program state...');
//     await program.methods.initialize(new anchor.BN(500), authority.publicKey)
//       .accounts({
//         programState,
//         owner: admin.publicKey,
//         systemProgram: SystemProgram.programId,
//       })
//       .signers([admin])
//       .rpc();
//     console.log('✅ Program initialized');

//     // Create token mint
//     console.log('🪙 Creating token mint...');
//     mint = await createMint(
//       provider.connection,
//       admin,
//       admin.publicKey,
//       null,
//       9
//     );
//     console.log("✅ Token mint created:", mint.toString());

//     // Initialize fee pool
//     [feePool] = PublicKey.findProgramAddressSync(
//       [Buffer.from('program_state'), Buffer.from('fee_pool')],
//       program.programId
//     );

//     // Create and fund user token account
//     console.log('💸 Setting up user funding...');
//     const userFundsAccount = await createAssociatedTokenAccount(
//       provider.connection,
//       admin,
//       mint,
//       user.publicKey
//     );

//     // Mint initial tokens to user
//     await mintTo(
//       provider.connection,
//       admin,
//       mint,
//       userFundsAccount,
//       admin,
//       fundAmount
//     );

//     // Get or create fee pool token account - Use getOrCreateAssociatedTokenAccount and allowOwnerOffCurve, explicit program IDs
//     const feePoolTokenAccount = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       admin,
//       mint,
//       feePool,
//       true, // Allow owner off-curve
//       TOKEN_PROGRAM_ID,
//       ASSOCIATED_TOKEN_PROGRAM_ID
//     );

//     // Add voucher funds to protocol
//     console.log('📥 Adding voucher funds...');
//     await program.methods.addVoucherFunds(new anchor.BN(fundAmount))
//       .accounts({
//         programState,
//         userTokenAccount: userFundsAccount,
//         feePoolTokenAccount: feePoolTokenAccount.address,
//         fundSource: user.publicKey,
//         tokenMint: mint,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
//         systemProgram: SystemProgram.programId,
//         rent: SYSVAR_RENT_PUBKEY,
//       })
//       .signers([user])
//       .rpc();

//     // Create event
//     [eventPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from('event'), new anchor.BN(eventId).toArrayLike(Buffer, 'le', 8)],
//       program.programId
//     );

//     console.log('🎟️ Creating test event...');
//     await program.methods.createEvent(
//       "Test Event",
//       new anchor.BN(Date.now() / 1000 + 100),
//       new anchor.BN(Date.now() / 1000 + 1000),
//       ["Team A Win", "Team B Win"],
//       new anchor.BN(voucherAmount)
//     )
//     .accounts({
//       programState,
//       event: eventPda,
//       owner: admin.publicKey,
//       systemProgram: SystemProgram.programId,
//     })
//     .signers([admin])
//     .rpc();

//     // Initialize user bet account
//     [userBetPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from('user_bet'), user.publicKey.toBuffer(), new anchor.BN(eventId).toArrayLike(Buffer, 'le', 8)],
//       program.programId
//     );

//     console.log('📝 Initializing user bet account...');
//     await program.methods.initializeUserBet()
//       .accounts({
//         event: eventPda,
//         user: user.publicKey,
//         userBet: userBetPda,
//         systemProgram: SystemProgram.programId,
//       })
//       .signers([user])
//       .rpc();
//       console.log('✅ User bet account initialized');
//     // Create user betting token account
//     userTokenAccount = await createAssociatedTokenAccount(
//       provider.connection,
//       admin,
//       mint,
//       user.publicKey
//     );
//     console.log('✅ Test setup completed');
//   });

//   it('should place bet with voucher successfully', async () => {
//     console.log('\n🏁 Starting test: place bet with voucher');

//     // Prepare message for signing
//     const nonce = 0;
//     const message = Buffer.concat([
//       Buffer.from('Voucher'),
//       new anchor.BN(eventId).toArrayLike(Buffer, 'le', 8),
//       user.publicKey.toBuffer(),
//       new anchor.BN(voucherAmount).toArrayLike(Buffer, 'le', 8),
//       new anchor.BN(nonce).toArrayLike(Buffer, 'le', 8),
//     ]);

//     // Generate Ed25519 signature
//     const signature = ed25519.sign(message, authority.secretKey.slice(0, 32));

//     // Get event pool PDA
//     [eventPool] = PublicKey.findProgramAddressSync(
//       [Buffer.from('event'), new anchor.BN(eventId).toArrayLike(Buffer, 'le', 8), Buffer.from('pool')],
//       program.programId
//     );

//     // Execute placeBetWithVoucher
//     console.log('🎰 Placing bet...');
//     await program.methods.placeBetWithVoucher(
//       eventId,
//       "Team A Win",
//       new anchor.BN(userDeposit),
//       new anchor.BN(voucherAmount),
//       new anchor.BN(nonce),
//       Array.from(signature)
//     )
//     .accounts({
//       programState,
//       event: eventPda,
//       userBet: userBetPda,
//       userTokenAccount,
//       eventPool,
//       feePool,
//       user: user.publicKey,
//       tokenProgram: TOKEN_PROGRAM_ID,
//       systemProgram: SystemProgram.programId,
//     })
//     .signers([user])
//     .rpc();

//     // Verify state changes
//     const eventAccount = await program.account.event.fetch(eventPda);
//     const userBetAccount = await program.account.userBet.fetch(userBetPda);
//     const programStateAccount = await program.account.programState.fetch(programState);

//     assert.equal(eventAccount.totalVoucherClaimed.toNumber(), voucherAmount);
//     assert.equal(userBetAccount.amount.toNumber(), totalBet);
//     assert.equal(userBetAccount.outcome, "Team A Win");

//     // Verify token balances
//     const userBalance = await provider.connection.getTokenAccountBalance(userTokenAccount);
//     const eventPoolBalance = await provider.connection.getTokenAccountBalance(eventPool);
//     const feePoolBalance = await provider.connection.getTokenAccountBalance(feePool);

//     assert.equal(userBalance.value.amount, (fundAmount - userDeposit).toString());
//     assert.equal(eventPoolBalance.value.amount, totalBet.toString());
//     assert.equal(feePoolBalance.value.amount, (fundAmount - voucherAmount).toString());
//   });
// });