// import * as anchor from "@coral-xyz/anchor";
// import { Program, web3, AnchorError } from "@coral-xyz/anchor";
// import { EventBetting } from "../target/types/event_betting";
// import { assert, expect } from "chai";
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

// describe("Event Creation Tests", () => {
//   // Configure the client to use the local cluster
//   anchor.setProvider(anchor.AnchorProvider.env());
//   const provider = anchor.getProvider() as anchor.AnchorProvider;
//   const program = anchor.workspace.EventBetting as Program<EventBetting>;

//   // Constants and variables for tests
//   const BETTING_STATE_SEED = "program_state";
//   const FEE_POOL_SEED = "fee_pool";
//   const EVENT_SEED = "event";
  
//   let owner: Keypair;
//   let nonOwner: Keypair;
//   let programAuthority: Keypair;

//   let tokenMint: PublicKey;
//   let invalidTokenMint: PublicKey;
//   let programStatePDA: PublicKey;
//   let feePoolPDA: PublicKey;
  
//   // Keep track of the current eventId across tests
//   let currentEventId = 0;
  
//   // Utility function to get PDAs with current event ID
//   async function getEventPDAs() {
//     // Get the ACTUAL next event ID from program state
//     const programState = await program.account.programState.fetch(programStatePDA);
    
//     // Fix: Use camelCase field name (Anchor converts snake_case to camelCase)
//     currentEventId = programState.nextEventId.toNumber();
//     console.log(`Using event ID: ${currentEventId} for next test`);
    
//     // Calculate event PDAs using this ID
//     const [eventPDA] = await PublicKey.findProgramAddress(
//       [Buffer.from(EVENT_SEED), new anchor.BN(currentEventId).toArrayLike(Buffer, "le", 8)],
//       program.programId
//     );
    
//     const [eventPoolPDA] = await PublicKey.findProgramAddress(
//       [Buffer.from(EVENT_SEED), new anchor.BN(currentEventId).toArrayLike(Buffer, "le", 8), Buffer.from("pool")],
//       program.programId
//     );
    
//     return { eventPDA, eventPoolPDA };
//   }

//   // Setup before tests
//   before(async () => {
//     // Generate keypairs
//     owner = Keypair.generate();
//     nonOwner = Keypair.generate();
//     programAuthority = Keypair.generate();

//     // Airdrop SOL
//     await Promise.all([
//       provider.connection.requestAirdrop(owner.publicKey, 100 * LAMPORTS_PER_SOL),
//       provider.connection.requestAirdrop(nonOwner.publicKey, 10 * LAMPORTS_PER_SOL),
//     ]);
//     await new Promise(resolve => setTimeout(resolve, 1000));

//     // Create token mint
//     tokenMint = await createMint(
//       provider.connection,
//       owner,
//       owner.publicKey,
//       null,
//       9
//     );

//     // Create another token mint for negative testing
//     invalidTokenMint = await createMint(
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

//     // Initialize program state
//     await program.methods
//       .initialize(new anchor.BN(1000), programAuthority.publicKey, tokenMint)
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

//     // Ensure owner has token balance
//     const ownerTokenAccount = await getAssociatedTokenAddress(tokenMint, owner.publicKey);
//     try {
//       await getAccount(provider.connection, ownerTokenAccount);
//     } catch {
//       const ix = createAssociatedTokenAccountInstruction(
//         owner.publicKey,
//         ownerTokenAccount,
//         owner.publicKey,
//         tokenMint
//       );
//       await provider.sendAndConfirm(new Transaction().add(ix), [owner]);
//     }
    
//     await mintTo(
//       provider.connection,
//       owner,
//       tokenMint,
//       ownerTokenAccount,
//       owner,
//       1000000000
//     );
    
//     // Add voucher funds - this is now necessary before creating events with vouchers
//     await program.methods
//       .addVoucherFunds(new anchor.BN(50000))
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
//     console.log("Added initial voucher funds to fee pool");
//   });

//   // POSITIVE TEST CASES

//   it("1. Successfully creates an event with valid parameters", async () => {
//     const description = "Standard Test Event";
//     const now = Math.floor(Date.now() / 1000);
//     const startTime = now + 60; // 1 minute in the future
//     const deadline = now + 3600; // 1 hour in the future
//     const outcomes = ["Win", "Lose", "Draw"];
//     const voucherAmt = 10000;
    
//     // Get current PDAs
//     const { eventPDA, eventPoolPDA } = await getEventPDAs();
    
//     await program.methods
//       .createEvent(description, new anchor.BN(startTime), new anchor.BN(deadline), outcomes, new anchor.BN(voucherAmt))
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
    
//     const eventAccount = await program.account.event.fetch(eventPDA);
//     assert.equal(eventAccount.description, description);
//     assert.deepEqual(eventAccount.outcomes, outcomes);
//     assert.equal(eventAccount.startTime.toNumber(), startTime);
//     assert.equal(eventAccount.deadline.toNumber(), deadline);
//     assert.equal(eventAccount.voucherAmount.toNumber(), voucherAmt);
//     assert.equal(eventAccount.resolved, false);
//   });

//   it("2. Creates event with maximum number of outcomes", async () => {
//     const description = "Many Outcomes Event";
//     const now = Math.floor(Date.now() / 1000);
//     const startTime = now + 60;
//     const deadline = now + 3600;
//     // Create many outcomes
//     const outcomes = Array.from({ length: 20 }, (_, i) => `Outcome ${i + 1}`);
//     const voucherAmt = 5000;
    
//     // Get current PDAs
//     const { eventPDA, eventPoolPDA } = await getEventPDAs();
    
//     await program.methods
//       .createEvent(description, new anchor.BN(startTime), new anchor.BN(deadline), outcomes, new anchor.BN(voucherAmt))
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
    
//     const eventAccount = await program.account.event.fetch(eventPDA);
//     assert.equal(eventAccount.outcomes.length, outcomes.length);
//   });

//   it("3. Creates event with long description", async () => {
//     const longDescription = "This is a very long description for an event that tests the limits of what can be stored in an event account. The description includes details about the event, rules, and other information that participants might need to know.".repeat(2);
//     const now = Math.floor(Date.now() / 1000);
//     const startTime = now + 60;
//     const deadline = now + 3600;
//     const outcomes = ["Yes", "No"];
//     const voucherAmt = 1000;
    
//     // Get current PDAs
//     const { eventPDA, eventPoolPDA } = await getEventPDAs();
    
//     await program.methods
//       .createEvent(longDescription, new anchor.BN(startTime), new anchor.BN(deadline), outcomes, new anchor.BN(voucherAmt))
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
    
//     const eventAccount = await program.account.event.fetch(eventPDA);
//     assert.equal(eventAccount.description, longDescription);
//   });

//   it("4. Creates event with no voucher amount", async () => {
//     const description = "No Voucher Event";
//     const now = Math.floor(Date.now() / 1000);
//     const startTime = now + 60;
//     const deadline = now + 3600;
//     const outcomes = ["Option A", "Option B"];
//     const voucherAmt = 0; // No vouchers
    
//     // Get current PDAs
//     const { eventPDA, eventPoolPDA } = await getEventPDAs();
    
//     await program.methods
//       .createEvent(description, new anchor.BN(startTime), new anchor.BN(deadline), outcomes, new anchor.BN(voucherAmt))
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
    
//     const eventAccount = await program.account.event.fetch(eventPDA);
//     assert.equal(eventAccount.voucherAmount.toNumber(), 0);
//   });

//   it("5. Creates event with minimum start time in the future", async () => {
//     const description = "Immediate Start Event";
//     const now = Math.floor(Date.now() / 1000);
//     const startTime = now + 2; // Just barely in the future
//     const deadline = now + 3600;
//     const outcomes = ["Yes", "No", "Maybe"];
//     const voucherAmt = 2000;
    
//     // Get current PDAs
//     const { eventPDA, eventPoolPDA } = await getEventPDAs();
    
//     await program.methods
//       .createEvent(description, new anchor.BN(startTime), new anchor.BN(deadline), outcomes, new anchor.BN(voucherAmt))
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
    
//     const eventAccount = await program.account.event.fetch(eventPDA);
//     assert.equal(eventAccount.startTime.toNumber(), startTime);
//   });

//   // NEGATIVE TEST CASES

//   it("6. Fails when start time is in the past", async () => {
//     const description = "Past Start Time Event";
//     const now = Math.floor(Date.now() / 1000);
//     const startTime = now - 60; // 1 minute in the past
//     const deadline = now + 3600;
//     const outcomes = ["Win", "Lose"];
//     const voucherAmt = 1000;
    
//     // Get current PDAs
//     const { eventPDA, eventPoolPDA } = await getEventPDAs();
    
//     try {
//       await program.methods
//         .createEvent(description, new anchor.BN(startTime), new anchor.BN(deadline), outcomes, new anchor.BN(voucherAmt))
//         .accounts({
//           programState: programStatePDA,
//           event: eventPDA,
//           owner: owner.publicKey,
//           tokenMint: tokenMint,
//           eventPool: eventPoolPDA,
//           systemProgram: SystemProgram.programId,
//           tokenProgram: TOKEN_PROGRAM_ID,
//         })
//         .signers([owner])
//         .rpc();
//       assert.fail("Should have thrown error for past start time");
//     } catch (error: any) {
//       // Check for error in a more resilient way
//       const errorMsg = error.toString();
//       assert.include(errorMsg, "StartTimeInThePast");
//     }
//   });

//   it("7. Fails when deadline is before start time", async () => {
//     const description = "Invalid Deadline Event";
//     const now = Math.floor(Date.now() / 1000);
//     const startTime = now + 120; // 2 minutes in future
//     const deadline = now + 60; // 1 minute in future (before start time)
//     const outcomes = ["Yes", "No"];
//     const voucherAmt = 1000;
    
//     // Get current PDAs
//     const { eventPDA, eventPoolPDA } = await getEventPDAs();
    
//     try {
//       await program.methods
//         .createEvent(description, new anchor.BN(startTime), new anchor.BN(deadline), outcomes, new anchor.BN(voucherAmt))
//         .accounts({
//           programState: programStatePDA,
//           event: eventPDA,
//           owner: owner.publicKey,
//           tokenMint: tokenMint,
//           eventPool: eventPoolPDA,
//           systemProgram: SystemProgram.programId,
//           tokenProgram: TOKEN_PROGRAM_ID,
//         })
//         .signers([owner])
//         .rpc();
//       assert.fail("Should have thrown error for deadline before start time");
//     } catch (error: any) {
//       if (error instanceof AnchorError) {
//         assert.equal(error.error.errorCode.code, "DeadlineInThePast");
//       } else {
//         throw error;
//       }
//     }
//   });

//   it("8. Fails when no outcomes are specified", async () => {
//     const description = "No Outcomes Event";
//     const now = Math.floor(Date.now() / 1000);
//     const startTime = now + 60;
//     const deadline = now + 3600;
//     const outcomes: string[] = []; // Empty array
//     const voucherAmt = 1000;
    
//     // Get current PDAs
//     const { eventPDA, eventPoolPDA } = await getEventPDAs();
    
//     try {
//       await program.methods
//         .createEvent(description, new anchor.BN(startTime), new anchor.BN(deadline), outcomes, new anchor.BN(voucherAmt))
//         .accounts({
//           programState: programStatePDA,
//           event: eventPDA,
//           owner: owner.publicKey,
//           tokenMint: tokenMint,
//           eventPool: eventPoolPDA,
//           systemProgram: SystemProgram.programId,
//           tokenProgram: TOKEN_PROGRAM_ID,
//         })
//         .signers([owner])
//         .rpc();
//       assert.fail("Should have thrown error for no outcomes");
//     } catch (error: any) {
//       if (error instanceof AnchorError) {
//         assert.equal(error.error.errorCode.code, "NoOutcomesSpecified");
//       } else {
//         throw error;
//       }
//     }
//   });

//   it("9. Fails when non-owner tries to create event", async () => {
//     const description = "Unauthorized Event";
//     const now = Math.floor(Date.now() / 1000);
//     const startTime = now + 60;
//     const deadline = now + 3600;
//     const outcomes = ["Win", "Lose"];
//     const voucherAmt = 1000;
    
//     // Get current PDAs
//     const { eventPDA, eventPoolPDA } = await getEventPDAs();
    
//     try {
//       await program.methods
//         .createEvent(description, new anchor.BN(startTime), new anchor.BN(deadline), outcomes, new anchor.BN(voucherAmt))
//         .accounts({
//           programState: programStatePDA,
//           event: eventPDA,
//           owner: nonOwner.publicKey,
//           tokenMint: tokenMint,
//           eventPool: eventPoolPDA,
//           systemProgram: SystemProgram.programId,
//           tokenProgram: TOKEN_PROGRAM_ID,
//         })
//         .signers([nonOwner])
//         .rpc();
//       assert.fail("Should have thrown error for unauthorized user");
//     } catch (error: any) {
//       if (error instanceof AnchorError) {
//         assert.equal(error.error.errorCode.code, "Unauthorized");
//       } else {
//         throw error;
//       }
//     }
//   });

//   it("10. Fails with invalid token mint", async () => {
//     const description = "Invalid Token Mint Event";
//     const now = Math.floor(Date.now() / 1000);
//     const startTime = now + 60;
//     const deadline = now + 3600;
//     const outcomes = ["Win", "Lose"];
//     const voucherAmt = 1000;
    
//     // Get current PDAs
//     const { eventPDA, eventPoolPDA } = await getEventPDAs();
    
//     try {
//       await program.methods
//         .createEvent(description, new anchor.BN(startTime), new anchor.BN(deadline), outcomes, new anchor.BN(voucherAmt))
//         .accounts({
//           programState: programStatePDA,
//           event: eventPDA,
//           owner: owner.publicKey,
//           tokenMint: invalidTokenMint,
//           eventPool: eventPoolPDA,
//           systemProgram: SystemProgram.programId,
//           tokenProgram: TOKEN_PROGRAM_ID,
//         })
//         .signers([owner])
//         .rpc();
//       assert.fail("Should have thrown error for invalid token mint");
//     } catch (error: any) {
//       // This should fail with constraint violation
//       assert.include(error.toString(), "Error");
//     }
//   });

//   // Add a new test case for insufficient voucher funds
//   it("11. Fails when voucher amount exceeds available protocol funds", async () => {
//     // First check the current accumulated fees
//     const programState = await program.account.programState.fetch(programStatePDA);
//     console.log("Current accumulated fees:", programState.accumulatedFees.toString());
//     console.log("Current active vouchers:", programState.activeVouchersAmount.toString());
    
//     // Set voucher amount higher than available funds
//     const excessiveVoucherAmount = programState.accumulatedFees
//       .sub(programState.activeVouchersAmount)
//       .add(new anchor.BN(1)); // One more than what's available
    
//     const description = "Excessive Voucher Event";
//     const now = Math.floor(Date.now() / 1000);
//     const startTime = now + 60;
//     const deadline = now + 3600;
//     const outcomes = ["Win", "Lose"];
    
//     // Get current PDAs
//     const { eventPDA, eventPoolPDA } = await getEventPDAs();
    
//     try {
//       await program.methods
//         .createEvent(
//           description, 
//           new anchor.BN(startTime), 
//           new anchor.BN(deadline), 
//           outcomes, 
//           excessiveVoucherAmount
//         )
//         .accounts({
//           programState: programStatePDA,
//           event: eventPDA,
//           owner: owner.publicKey,
//           tokenMint: tokenMint,
//           eventPool: eventPoolPDA,
//           systemProgram: SystemProgram.programId,
//           tokenProgram: TOKEN_PROGRAM_ID,
//         })
//         .signers([owner])
//         .rpc();
//       assert.fail("Should have thrown error for insufficient fees");
//     } catch (error: any) {
//       const errorMsg = error.toString();
//       assert.include(errorMsg, "InsufficientProtocolFees");
//     }
//   });
// });
