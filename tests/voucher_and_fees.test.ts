// import * as anchor from "@coral-xyz/anchor";
// import { Program } from "@coral-xyz/anchor";
// import { EventBetting } from "../target/types/event_betting";
// import { assert } from "chai";
// import {
//   createMint,
//   getAssociatedTokenAddress,
//   getAccount,
//   mintTo,
//   TOKEN_PROGRAM_ID,
//   createAssociatedTokenAccountInstruction,
// } from "@solana/spl-token";
// import {
//   PublicKey,
//   SystemProgram,
//   Transaction,
//   Keypair,
//   LAMPORTS_PER_SOL,
// } from "@solana/web3.js";
// import { Buffer } from "buffer";

// describe("Voucher and Fees Lifecycle Tests", () => {
//   // Configure the client
//   anchor.setProvider(anchor.AnchorProvider.env());
//   const provider = anchor.getProvider() as anchor.AnchorProvider;
//   const program = anchor.workspace.EventBetting as Program<EventBetting>;

//   // Constants
//   const BETTING_STATE_SEED = "program_state";
//   const FEE_POOL_SEED = "fee_pool";
//   const EVENT_SEED = "event";
//   const USER_BET_SEED = "user_bet";
  
//   // Initial settings
//   const INITIAL_FEE_PERCENTAGE = 500; // 5.00%
//   const INITIAL_VOUCHER_FUNDS = 100_000;
//   const EVENT_VOUCHER_AMOUNT = 50_000;
  
//   // Test accounts
//   let owner: Keypair;
//   let programAuthority: Keypair;
//   let bettor1: Keypair;
//   let bettor2: Keypair;
  
//   // PDAs and accounts
//   let tokenMint: PublicKey;
//   let programStatePDA: PublicKey;
//   let feePoolPDA: PublicKey;
//   let eventPDA: PublicKey;
//   let eventPoolPDA: PublicKey;
  
//   // Token accounts
//   let ownerTokenAccount: PublicKey;
//   let bettor1TokenAccount: PublicKey;
//   let bettor2TokenAccount: PublicKey;
  
//   // For tracking changes
//   let initialFeePoolBalance: anchor.BN;
//   let initialAccumulatedFees: anchor.BN;
//   let initialActiveVouchers: anchor.BN;

//   before(async () => {
//     // Generate keypairs
//     owner = Keypair.generate();
//     programAuthority = Keypair.generate();
//     bettor1 = Keypair.generate();
//     bettor2 = Keypair.generate();

//     // Airdrop SOL
//     await Promise.all([
//       provider.connection.requestAirdrop(owner.publicKey, 100 * LAMPORTS_PER_SOL),
//       provider.connection.requestAirdrop(bettor1.publicKey, 50 * LAMPORTS_PER_SOL),
//       provider.connection.requestAirdrop(bettor2.publicKey, 50 * LAMPORTS_PER_SOL),
//     ]);
//     await new Promise(resolve => setTimeout(resolve, 2000));

//     // Create token mint
//     tokenMint = await createMint(
//       provider.connection,
//       owner,
//       owner.publicKey,
//       null,
//       9
//     );

//     // Derive PDAs
//     [programStatePDA] = await PublicKey.findProgramAddress(
//       [Buffer.from(BETTING_STATE_SEED)],
//       program.programId
//     );
//     [feePoolPDA] = await PublicKey.findProgramAddress(
//       [Buffer.from(BETTING_STATE_SEED), Buffer.from(FEE_POOL_SEED)],
//       program.programId
//     );

//     // Create token accounts
//     ownerTokenAccount = await getAssociatedTokenAddress(tokenMint, owner.publicKey);
//     bettor1TokenAccount = await getAssociatedTokenAddress(tokenMint, bettor1.publicKey);
//     bettor2TokenAccount = await getAssociatedTokenAddress(tokenMint, bettor2.publicKey);

//     // Create ATAs if needed
//     for (const [keypair, ata] of [
//       [owner, ownerTokenAccount],
//       [bettor1, bettor1TokenAccount],
//       [bettor2, bettor2TokenAccount],
//     ]) {
//       try {
//         await getAccount(provider.connection, ata);
//       } catch {
//         const ix = createAssociatedTokenAccountInstruction(
//           keypair.publicKey,
//           ata,
//           keypair.publicKey,
//           tokenMint
//         );
//         await provider.sendAndConfirm(new Transaction().add(ix), [keypair]);
//       }
//     }

//     // Mint tokens
//     await mintTo(provider.connection, owner, tokenMint, ownerTokenAccount, owner, 10_000_000_000);
//     await mintTo(provider.connection, owner, tokenMint, bettor1TokenAccount, owner, 1_000_000_000);
//     await mintTo(provider.connection, owner, tokenMint, bettor2TokenAccount, owner, 1_000_000_000);

//     // Initialize program state
//     await program.methods
//       .initialize(new anchor.BN(INITIAL_FEE_PERCENTAGE), programAuthority.publicKey, tokenMint)
//       .accounts({
//         programState: programStatePDA,
//         feePool: feePoolPDA,
//         owner: owner.publicKey,
//         tokenMint: tokenMint,
//         systemProgram: SystemProgram.programId,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//       })
//       .signers([owner])
//       .rpc();
//   });

//   it("1. Adds initial voucher funds", async () => {
//     // Initial state
//     const voucherAmount = new anchor.BN(INITIAL_VOUCHER_FUNDS);
//     const beforeFeePool = await getAccount(provider.connection, feePoolPDA);
//     const beforeState = await program.account.programState.fetch(programStatePDA);
    
//     await program.methods
//       .addVoucherFunds(voucherAmount)
//       .accounts({
//         programState: programStatePDA,
//         userTokenAccount: ownerTokenAccount,
//         feePool: feePoolPDA,
//         fundSource: owner.publicKey,
//         tokenMint: tokenMint,
//         tokenProgram: TOKEN_PROGRAM_ID,
//       })
//       .signers([owner])
//       .rpc();
      
//     // Check state after
//     const afterFeePool = await getAccount(provider.connection, feePoolPDA);
//     const afterState = await program.account.programState.fetch(programStatePDA);
    
//     // Verify fee pool balance increased
//     assert.equal(
//       new anchor.BN(afterFeePool.amount.toString()).sub(new anchor.BN(beforeFeePool.amount.toString())).toString(),
//       voucherAmount.toString(),
//       "Fee pool balance should increase by voucher amount"
//     );
    
//     // Verify accumulated fees increased
//     assert.equal(
//       afterState.accumulatedFees.toString(),
//       beforeState.accumulatedFees.add(voucherAmount).toString(),
//       "Accumulated fees should increase by voucher amount"
//     );
    
//     // Save initial values for later tests
//     initialFeePoolBalance = new anchor.BN(afterFeePool.amount.toString());
//     initialAccumulatedFees = afterState.accumulatedFees;
//     initialActiveVouchers = afterState.activeVouchersAmount;
    
//     console.log("Initial fee pool balance:", initialFeePoolBalance.toString());
//     console.log("Initial accumulated fees:", initialAccumulatedFees.toString());
//   });

//   it("2. Creates an event with voucher allocation", async () => {
//     // Create event parameters
//     const description = "Voucher Test Event";
//     const now = Math.floor(Date.now() / 1000);
//     // Modified: Use extremely short deadline (just 10 seconds) to allow testing resolution
//     const startTime = now + 3; // Start very soon
//     const deadline = now + 10; // End in 10 seconds (was 3600)
//     const outcomes = ["Outcome A", "Outcome B"];
//     const voucherAmount = new anchor.BN(EVENT_VOUCHER_AMOUNT);
    
//     // Get the next event ID
//     const programState = await program.account.programState.fetch(programStatePDA);
//     const eventId = programState.nextEventId.toNumber();
//     console.log("Creating event with ID:", eventId);
    
//     // Calculate PDAs
//     [eventPDA] = await PublicKey.findProgramAddress(
//       [Buffer.from(EVENT_SEED), new anchor.BN(eventId).toArrayLike(Buffer, "le", 8)],
//       program.programId
//     );
//     [eventPoolPDA] = await PublicKey.findProgramAddress(
//       [Buffer.from(EVENT_SEED), new anchor.BN(eventId).toArrayLike(Buffer, "le", 8), Buffer.from("pool")],
//       program.programId
//     );
    
//     // Get state before
//     const beforeState = await program.account.programState.fetch(programStatePDA);
    
//     // Create event
//     await program.methods
//       .createEvent(description, new anchor.BN(startTime), new anchor.BN(deadline), outcomes, voucherAmount)
//       .accounts({
//         programState: programStatePDA,
//         event: eventPDA,
//         owner: owner.publicKey,
//         tokenMint: tokenMint,
//         eventPool: eventPoolPDA,
//         systemProgram: SystemProgram.programId,
//         tokenProgram: TOKEN_PROGRAM_ID,
//       })
//       .signers([owner])
//       .rpc();
    
//     // Increase wait time to ensure event has properly started before placing bets
//     console.log(`Waiting for event to start (start time: ${new Date(startTime * 1000).toLocaleTimeString()})...`);
//     await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds instead of 3
    
//     // Verify event is ready for betting by checking current time vs start time
//     const eventAccount = await program.account.event.fetch(eventPDA);
//     const currentTimestamp = Math.floor(Date.now() / 1000);
//     console.log(`Current time: ${currentTimestamp}, Event start: ${eventAccount.startTime}`);
//     console.log(`Event betting ${currentTimestamp >= eventAccount.startTime ? "is ready" : "not ready yet"}`);
    
//     // Check state after
//     const afterState = await program.account.programState.fetch(programStatePDA);
    
//     // Verify active vouchers increased
//     assert.equal(
//       afterState.activeVouchersAmount.toString(),
//       beforeState.activeVouchersAmount.add(voucherAmount).toString(),
//       "Active vouchers should increase by event voucher amount"
//     );
    
//     // Verify event has correct voucher allocation
//     assert.equal(
//       eventAccount.voucherAmount.toString(),
//       voucherAmount.toString(),
//       "Event should have correct voucher amount"
//     );
//   });

//   it("3. Places bets with and without vouchers", async () => {
//     // Set up bet parameters
//     const regularBetAmount = new anchor.BN(10_000);
//     const voucherBetAmount = new anchor.BN(5_000);
//     const voucherUseAmount = new anchor.BN(3_000);
    
//     // Get state before
//     const beforeState = await program.account.programState.fetch(programStatePDA);
//     const beforeEvent = await program.account.event.fetch(eventPDA);
    
//     // Store the current event ID for later use
//     const currentEventId = beforeEvent.id;
//     console.log("Using event ID for bets:", currentEventId.toString());
    
//     // 3.1 Bettor1 places bet without voucher
//     const [bettor1BetPDA] = await PublicKey.findProgramAddress(
//       [
//         Buffer.from(USER_BET_SEED),
//         bettor1.publicKey.toBuffer(),
//         currentEventId.toArrayLike(Buffer, "le", 8)
//       ],
//       program.programId
//     );
    
//     try {
//       await program.methods
//         .placeBet("Outcome A", regularBetAmount, new anchor.BN(0))
//         .accounts({
//           programState: programStatePDA,
//           adminSigner: programAuthority.publicKey,
//           event: eventPDA,
//           userBet: bettor1BetPDA,
//           userTokenAccount: bettor1TokenAccount,
//           eventPool: eventPoolPDA,
//           feePool: feePoolPDA,
//           user: bettor1.publicKey,
//           tokenProgram: TOKEN_PROGRAM_ID,
//           systemProgram: SystemProgram.programId,
//         })
//         .signers([bettor1, programAuthority])
//         .rpc();
        
//       console.log("Bettor1 placed bet successfully");
//     } catch (error) {
//       console.error("Error placing bettor1 bet:", error);
//       throw error;
//     }
    
//     // 3.2 Bettor2 places bet with voucher
//     const [bettor2BetPDA] = await PublicKey.findProgramAddress(
//       [
//         Buffer.from(USER_BET_SEED),
//         bettor2.publicKey.toBuffer(),
//         currentEventId.toArrayLike(Buffer, "le", 8)
//       ],
//       program.programId
//     );
    
//     try {
//       await program.methods
//         .placeBet("Outcome B", voucherBetAmount, voucherUseAmount)
//         .accounts({
//           programState: programStatePDA,
//           adminSigner: programAuthority.publicKey,
//           event: eventPDA,
//           userBet: bettor2BetPDA,
//           userTokenAccount: bettor2TokenAccount,
//           eventPool: eventPoolPDA,
//           feePool: feePoolPDA,
//           user: bettor2.publicKey,
//           tokenProgram: TOKEN_PROGRAM_ID,
//           systemProgram: SystemProgram.programId,
//         })
//         .signers([bettor2, programAuthority])
//         .rpc();
        
//       console.log("Bettor2 placed bet successfully");
//     } catch (error) {
//       console.error("Error placing bettor2 bet:", error);
//       throw error;
//     }
    
//     // Check state after
//     const afterState = await program.account.programState.fetch(programStatePDA);
//     const afterEvent = await program.account.event.fetch(eventPDA);
    
//     // Verify accumulated fees decreased by voucher use
//     assert.equal(
//       afterState.accumulatedFees.toString(),
//       beforeState.accumulatedFees.sub(voucherUseAmount).toString(),
//       "Accumulated fees should decrease by voucher use amount"
//     );
    
//     // Verify event claimed vouchers increased
//     assert.equal(
//       afterEvent.totalVoucherClaimed.toString(),
//       beforeEvent.totalVoucherClaimed.add(voucherUseAmount).toString(),
//       "Event claimed vouchers should increase"
//     );
    
//     // Verify event pool contains all bet amounts
//     const eventPool = await getAccount(provider.connection, eventPoolPDA);
//     const expectedPoolAmount = regularBetAmount.add(voucherBetAmount).add(voucherUseAmount);
//     assert.equal(
//       eventPool.amount.toString(),
//       expectedPoolAmount.toString(),
//       "Event pool should contain all bet amounts"
//     );
    
//     // Store event ID in a global variable to use in claim test
//     globalThis.testEventId = currentEventId;
//   });

//   it("4. Updates voucher amount", async () => {
//     // Increase voucher amount
//     const additionalVoucherAmount = new anchor.BN(10_000);
//     const beforeState = await program.account.programState.fetch(programStatePDA);
//     const beforeEvent = await program.account.event.fetch(eventPDA);
    
//     const newVoucherAmount = beforeEvent.voucherAmount.add(additionalVoucherAmount);
    
//     await program.methods
//       .updateVoucherAmount(newVoucherAmount)
//       .accounts({
//         programState: programStatePDA,
//         event: eventPDA,
//         owner: owner.publicKey,
//       })
//       .signers([owner])
//       .rpc();
    
//     // Check state after
//     const afterState = await program.account.programState.fetch(programStatePDA);
//     const afterEvent = await program.account.event.fetch(eventPDA);
    
//     // Verify active vouchers increased
//     assert.equal(
//       afterState.activeVouchersAmount.toString(),
//       beforeState.activeVouchersAmount.add(additionalVoucherAmount).toString(),
//       "Active vouchers should increase by additional amount"
//     );
    
//     // Verify event voucher amount updated
//     assert.equal(
//       afterEvent.voucherAmount.toString(),
//       newVoucherAmount.toString(),
//       "Event voucher amount should be updated"
//     );
//   });

//   it("5. Resolves event", async () => {
//     // Get state before
//     const beforeState = await program.account.programState.fetch(programStatePDA);
//     const beforeEvent = await program.account.event.fetch(eventPDA);
    
//     // Calculate expected unclaimed vouchers
//     const unclaimedVouchers = beforeEvent.voucherAmount.sub(beforeEvent.totalVoucherClaimed);
    
//     // Wait until the event deadline has passed
//     const currentTime = Math.floor(Date.now() / 1000);
//     if (currentTime <= beforeEvent.deadline.toNumber()) {
//       const waitTime = (beforeEvent.deadline.toNumber() - currentTime + 1) * 1000;
//       console.log(`Waiting ${waitTime}ms for event deadline to pass...`);
//       await new Promise(resolve => setTimeout(resolve, waitTime));
//     }
    
//     // Resolve event - bettor1 is winner
//     await program.methods
//       .resolveEvent("Outcome A")
//       .accounts({
//         programState: programStatePDA,
//         event: eventPDA,
//         eventPool: eventPoolPDA,
//         feePool: feePoolPDA,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         owner: owner.publicKey,
//       })
//       .signers([owner])
//       .rpc();
    
//     // Check state after
//     const afterState = await program.account.programState.fetch(programStatePDA);
//     const afterEvent = await program.account.event.fetch(eventPDA);
    
//     // Verify event is resolved
//     assert.equal(afterEvent.resolved, true);
//     assert.equal(afterEvent.winningOutcome, "Outcome A");
    
//     // Verify active vouchers decreased by unclaimed amount
//     assert.equal(
//       afterState.activeVouchersAmount.toString(),
//       beforeState.activeVouchersAmount.sub(unclaimedVouchers).toString(),
//       "Active vouchers should decrease by unclaimed amount"
//     );
    
//     // Verify fee pool received fee amount (5% of total pool)
//     const expectedFee = Math.floor(beforeEvent.totalPool.toNumber() * INITIAL_FEE_PERCENTAGE / 10000);
//     const afterEventPool = await getAccount(provider.connection, eventPoolPDA);
//     assert.equal(
//       afterEvent.totalPool.toString(),
//       new anchor.BN(beforeEvent.totalPool.toNumber() - expectedFee).toString(),
//       "Event pool should decrease by fee amount"
//     );
    
//     // Verify accumulated fees increased by fee amount
//     assert.equal(
//       afterState.accumulatedFees.toString(),
//       beforeState.accumulatedFees.add(new anchor.BN(expectedFee)).toString(),
//       "Accumulated fees should increase by fee amount"
//     );
//   });

//   it("6. Claims winnings", async () => {
//     // Get state before
//     const beforeBalanceBettor1 = (await getAccount(provider.connection, bettor1TokenAccount)).amount;
    
//     // Use the stored event ID from the bet placement test
//     const eventId = globalThis.testEventId || (await program.account.event.fetch(eventPDA)).id;
//     console.log("Using event ID for claiming:", eventId.toString());
    
//     // Get user bet PDA using the correct event ID
//     const [bettor1BetPDA] = await PublicKey.findProgramAddress(
//       [
//         Buffer.from(USER_BET_SEED),
//         bettor1.publicKey.toBuffer(),
//         eventId.toArrayLike(Buffer, "le", 8)
//       ],
//       program.programId
//     );
    
//     // Verify the user bet account exists before trying to claim
//     try {
//       const betAccount = await program.account.userBet.fetch(bettor1BetPDA);
//       console.log("Found bet account with amount:", betAccount.amount.toString());
//     } catch (e) {
//       console.error("User bet account not found:", e);
//       throw new Error("User bet account does not exist. Make sure the bet was placed successfully.");
//     }
    
//     // Claim winnings
//     await program.methods
//       .claimWinnings()
//       .accounts({
//         programState: programStatePDA,
//         user: bettor1.publicKey,
//         userTokenAccount: bettor1TokenAccount,
//         event: eventPDA,
//         userBet: bettor1BetPDA,
//         eventPool: eventPoolPDA,
//         tokenProgram: TOKEN_PROGRAM_ID,
//       })
//       .signers([bettor1])
//       .rpc();
    
//     // Check state after
//     const afterBalanceBettor1 = (await getAccount(provider.connection, bettor1TokenAccount)).amount;
//     const userBet = await program.account.userBet.fetch(bettor1BetPDA);
    
//     // Verify user bet amount is zeroed
//     assert.equal(userBet.amount.toString(), "0", "User bet amount should be zeroed after claiming");
    
//     // Verify user received winnings
//     assert.isTrue(
//       new anchor.BN(afterBalanceBettor1.toString()).gt(new anchor.BN(beforeBalanceBettor1.toString())),
//       "User should receive winnings"
//     );
    
//     console.log("Claimed winnings amount:", new anchor.BN(afterBalanceBettor1.toString()).sub(new anchor.BN(beforeBalanceBettor1.toString())).toString());
//   });

//   it("7. Withdraws fees", async () => {
//     // Get current state
//     const beforeState = await program.account.programState.fetch(programStatePDA);
//     const beforeOwnerBalance = (await getAccount(provider.connection, ownerTokenAccount)).amount;
    
//     // Calculate available fees (accumulated - active vouchers)
//     const availableFees = beforeState.accumulatedFees.sub(beforeState.activeVouchersAmount);
//     console.log("Available fees for withdrawal:", availableFees.toString());
    
//     // Withdraw fees
//     await program.methods
//       .withdrawFees(availableFees)
//       .accounts({
//         programState: programStatePDA,
//         feePool: feePoolPDA,
//         ownerTokenAccount: ownerTokenAccount,
//         owner: owner.publicKey,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         systemProgram: SystemProgram.programId,
//       })
//       .signers([owner])
//       .rpc();
    
//     // Check state after
//     const afterState = await program.account.programState.fetch(programStatePDA);
//     const afterOwnerBalance = (await getAccount(provider.connection, ownerTokenAccount)).amount;
    
//     // Verify accumulated fees decreased
//     assert.equal(
//       afterState.accumulatedFees.toString(),
//       beforeState.accumulatedFees.sub(availableFees).toString(),
//       "Accumulated fees should decrease by withdrawn amount"
//     );
    
//     // Verify owner received fees
//     assert.equal(
//       new anchor.BN(afterOwnerBalance.toString()).sub(new anchor.BN(beforeOwnerBalance.toString())).toString(),
//       availableFees.toString(),
//       "Owner should receive withdrawn fees"
//     );
//   });

//   it("8. Fails when trying to withdraw more than available fees", async () => {
//     // Get current state
//     const currentState = await program.account.programState.fetch(programStatePDA);
    
//     // Try to withdraw more than available
//     const excessiveAmount = currentState.accumulatedFees.add(new anchor.BN(1));
    
//     try {
//       await program.methods
//         .withdrawFees(excessiveAmount)
//         .accounts({
//           programState: programStatePDA,
//           feePool: feePoolPDA,
//           ownerTokenAccount: ownerTokenAccount,
//           owner: owner.publicKey,
//           tokenProgram: TOKEN_PROGRAM_ID,
//           systemProgram: SystemProgram.programId,
//         })
//         .signers([owner])
//         .rpc();
        
//       assert.fail("Should have thrown error for insufficient fees");
//     } catch (error: any) {
//       assert.include(error.toString(), "InsufficientFees");
//     }
//   });
// });
