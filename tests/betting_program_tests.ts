// import * as anchor from "@coral-xyz/anchor";
// import { Program } from "@coral-xyz/anchor";
// import { EventBetting } from "../target/types/event_betting";
// import { assert } from "chai";
// import { 
//   createMint, 
//   createAccount, 
//   mintTo, 
//   TOKEN_PROGRAM_ID,
//   getAccount,
//   getAssociatedTokenAddress,
//   createAssociatedTokenAccountInstruction,
// } from "@solana/spl-token";
// import { PublicKey, SystemProgram, Transaction, Keypair, Connection, Provider } from "@solana/web3.js";

// // Move getTokenBalance outside of describe block and add provider parameter
// async function getTokenBalance(connection: Connection, tokenAccount: PublicKey): Promise<anchor.BN> {
//     try {
//         const account = await getAccount(connection, tokenAccount);
//         return new anchor.BN(account.amount.toString());
//     } catch (error) {
//         console.error("Error getting token balance:", error);
//         throw error;
//     }
// }

// describe("betting_program", () => {
//   const provider = anchor.AnchorProvider.env();
//   anchor.setProvider(provider);
//   const program = anchor.workspace.EventBetting as Program<EventBetting>;

//   // Create a map to store program state owners
//   let currentOwner: Keypair;
//   let programStatePda: PublicKey;
//   let feePoolPda: PublicKey;
//   let mint: PublicKey;
//   let sharedUserTokenAccount: PublicKey;

//   // Add helper function to get or create program state owner
//   async function getCurrentOwner(): Promise<Keypair> {
//     try {
//       const state = await program.account.programState.fetch(programStatePda);
//       // Create a new keypair for the current owner
//       const ownerKeypair = Keypair.generate();
      
//       // Fund the new keypair
//       const airdropSig = await provider.connection.requestAirdrop(
//         ownerKeypair.publicKey,
//         1000000000
//       );
//       await provider.connection.confirmTransaction(airdropSig);

//       // Transfer ownership to the new keypair
//       await program.methods.updateOwner(ownerKeypair.publicKey)
//         .accounts({
//           programState: programStatePda,
//           owner: state.owner,
//         })
//         .signers([provider.wallet.payer])
//         .rpc();

//       return ownerKeypair;
//     } catch {
//       // If program state doesn't exist, initialize it with provider wallet
//       await program.methods.initialize(
//         new anchor.BN(100),
//         provider.wallet.publicKey
//       ).accounts({
//         programState: programStatePda,
//         owner: provider.wallet.publicKey,
//         systemProgram: SystemProgram.programId,
//         rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//       })
//       .signers([provider.wallet.payer])
//       .rpc();

//       return provider.wallet.payer as Keypair;
//     }
//   }

//   // Global variables for all tests
//   // Run once before all tests
//   before(async () => {
//     console.log("=== Test Suite Setup ===");
    
//     // Derive program state PDA
//     [programStatePda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("program_state")],
//       program.programId
//     );
//     console.log("Program State PDA:", programStatePda.toBase58());
//     console.log("Initializing with wallet:", provider.wallet.publicKey.toBase58());

//     // Initialize program state and get current owner
//     currentOwner = await getCurrentOwner();

//     // Initialize program state if it doesn't exist
//     try {
//       const state = await program.account.programState.fetch(programStatePda);
//       console.log("Found existing program state");
      
//       // Update owner to current wallet if needed
//       if (state.owner.toBase58() !== provider.wallet.publicKey.toBase58()) {
//         console.log("Updating program state owner from", state.owner.toBase58(), "to", provider.wallet.publicKey.toBase58());
//         await program.methods.updateOwner(provider.wallet.publicKey)
//           .accounts({
//             programState: programStatePda,
//             owner: state.owner,
//           })
//           .remainingAccounts([{
//             pubkey: state.owner,
//             isWritable: true,
//             isSigner: true
//           }])
//           .signers([currentOwner])
//           .rpc();
//       }
//     } catch (error) {
//       console.log("Initializing new program state");
//       await initializeProgramState();
//     }

//     // Create mint
//     try {
//       mint = await createMint(
//         provider.connection,
//         provider.wallet.payer,
//         provider.wallet.publicKey,
//         provider.wallet.publicKey,
//         9
//       );
//       console.log("Mint created:", mint.toBase58());
//     } catch (error) {
//       console.error("Error creating mint:", error);
//       throw error;
//     }

//     // Calculate fee pool PDA
//     [feePoolPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("program_state"), Buffer.from("fee_pool")],
//       program.programId
//     );
//     console.log("Fee pool PDA:", feePoolPda.toBase58());

//     try {
//       // Try to fetch existing program state
//       try {
//         const state = await program.account.programState.fetch(programStatePda);
//         console.log("Found existing program state with owner:", state.owner.toBase58());
        
//         // If owner doesn't match, update it
//         if (state.owner.toBase58() !== provider.wallet.publicKey.toBase58()) {
//           console.log("Updating program state owner...");
//           await program.methods.updateOwner(provider.wallet.publicKey)
//               .accounts({
//                   programState: programStatePda,
//                   owner: state.owner,
//               }).rpc();
//         }
//       } catch {
//         // Program state doesn't exist, initialize it
//         console.log("Initializing new program state...");
//         await program.methods.initialize(
//           new anchor.BN(100),
//           PublicKey.default
//         ).accounts({
//           programState: programStatePda,
//           owner: provider.wallet.publicKey,
//           systemProgram: SystemProgram.programId,
//           rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//         }).rpc();
//       }

//       // Verify program state
//       const state = await program.account.programState.fetch(programStatePda);
//       console.log("Program state owner:", state.owner.toBase58());
//       console.log("Current wallet:", provider.wallet.publicKey.toBase58());

//       // Initialize or verify fee pool
//       try {
//         await program.methods.initializeFeePool().accounts({
//           feePool: feePoolPda,
//           authority: provider.wallet.publicKey,
//           programState: programStatePda,
//           tokenMint: mint,
//           tokenProgram: TOKEN_PROGRAM_ID,
//           systemProgram: SystemProgram.programId,
//           rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//         }).rpc();
//         console.log("Fee pool initialized successfully");
//       } catch (error) {
//         if ((error as any).message?.includes("already in use")) {
//           console.log("Fee pool already exists");
//         } else {
//           throw error;
//         }
//       }

//     } catch (error) {
//       console.error("Setup error:", error);
//       if ((error as any).logs) {
//         console.error("Program logs:", (error as any).logs);
//       }
//       throw error;
//     }

//     // Create and initialize shared user token account
//     sharedUserTokenAccount = await getAssociatedTokenAddress(mint, provider.wallet.publicKey);
//     try {
//       await getAccount(provider.connection, sharedUserTokenAccount);
//       console.log("Token account exists");
//     } catch {
//       const tx = new Transaction().add(
//         createAssociatedTokenAccountInstruction(
//           provider.wallet.publicKey,
//           sharedUserTokenAccount,
//           provider.wallet.publicKey,
//           mint
//         )
//       );
//       await provider.sendAndConfirm(tx);
//       console.log("Token account created");
//     }

//     // Fund shared user token account
//     await mintTo(
//       provider.connection,
//       provider.wallet.payer,
//       mint,
//       sharedUserTokenAccount,
//       provider.wallet.publicKey,
//       2000000000
//     );
//     console.log("Token account funded");
//   });

//   // Utility function for setting up token accounts
//   async function setupTokenAccount(owner: PublicKey, payer: PublicKey = provider.wallet.publicKey): Promise<PublicKey> {
//     const tokenAccount = await getAssociatedTokenAddress(mint, owner);
    
//     try {
//         // Check if account already exists
//         await getAccount(provider.connection, tokenAccount);
//         console.log("Token account already exists");
//     } catch (error) {
//         // Account doesn't exist, create it
//         console.log("Creating new token account");
//         const tx = new Transaction().add(
//             createAssociatedTokenAccountInstruction(
//                 payer,
//                 tokenAccount,
//                 owner,
//                 mint
//             )
//         );
//         await provider.sendAndConfirm(tx);
//     }
//     return tokenAccount;
//   }

//   it("should create an event", async () => {
//     try {
//       // Get the next event ID
//       const programState = await program.account.programState.fetch(programStatePda);
//       const eventId = programState.nextEventId;

//       // Calculate event PDA
//       const [eventPda] = PublicKey.findProgramAddressSync(
//         [Buffer.from("event"), new anchor.BN(eventId).toBuffer("le", 8)],
//         program.programId
//       );

//       // Event parameters
//       const description = "Test Event";
//       const startTime = Math.floor(Date.now() / 1000) + 3600; // Start in 1 hour
//       const deadline = startTime + 86400; // End in 24 hours
//       const possibleOutcomes = ["Team A", "Team B"];
//       const voucherAmount = new anchor.BN(0); // No voucher for this test

//       // Create event
//       await program.methods.createEvent(
//         description,
//         new anchor.BN(startTime),
//         new anchor.BN(deadline),
//         possibleOutcomes,
//         voucherAmount
//       ).accounts({
//         programState: programStatePda,
//         event: eventPda,
//         owner: provider.wallet.publicKey,
//         systemProgram: SystemProgram.programId,
//       }).rpc();

//       // Verify event was created correctly
//       const eventAccount = await program.account.event.fetch(eventPda);
      
//       // Assert all event properties using toString() for BN comparisons
//       assert.equal(eventAccount.id.toNumber(), eventId, "Event ID mismatch");
//       assert.equal(eventAccount.description, description, "Description mismatch");
//       assert.equal(eventAccount.startTime.toNumber(), startTime, "Start time mismatch");
//       assert.equal(eventAccount.deadline.toNumber(), deadline, "Deadline mismatch");
//       assert.deepEqual(eventAccount.possibleOutcomes, possibleOutcomes, "Outcomes mismatch");
//       assert.equal(eventAccount.voucherAmount.toNumber(), 0, "Voucher amount mismatch");
//       assert.equal(eventAccount.totalVoucherClaimed.toNumber(), 0, "Total voucher claimed mismatch");
//       assert.equal(eventAccount.totalPool.toNumber(), 0, "Total pool mismatch");
//       assert.equal(eventAccount.winningOutcome, null, "Winning outcome should be null");
//       assert.deepEqual(eventAccount.totalBetsByOutcome.map(b => b.toNumber()), [0, 0], "Bets by outcome mismatch");

//       // Verify program state was updated
//       const updatedProgramState = await program.account.programState.fetch(programStatePda);
//       assert.equal(updatedProgramState.nextEventId.toNumber(), eventId + 1, "Next event ID mismatch");
//       assert.equal(updatedProgramState.activeVouchersAmount.toNumber(), 0, "Active vouchers amount mismatch");

//     } catch (error) {
//       console.error("Error creating event:", error);
//       const err: any = error;
//       if (err.message) {
//         console.error("Error Message:", err.message);
//       }
//       if (err.logs) {
//         console.error("Program Logs:", err.logs);
//       }
//       throw error;
//     }
//   });

//   it("should successfully create event with voucher amount", async () => {
//     const voucherAmount = new anchor.BN(1000000000);
//     // Verify ownership again before creating event
//     await program.methods.addVoucherFunds(voucherAmount)
//                 .accounts({
//                     programState: programStatePda,
//                     userTokenAccount: sharedUserTokenAccount,
//                     feePool: feePoolPda,
//                     fundSource: provider.wallet.publicKey,
//                     tokenProgram: TOKEN_PROGRAM_ID,
//                     systemProgram: SystemProgram.programId,
//                 })
//                 .rpc();
    
//     const currentState = await program.account.programState.fetch(programStatePda);
//     console.log("State before creating event:", {
//         owner: currentState.owner.toBase58(),
//         wallet: provider.wallet.publicKey.toBase58(),
//         accumulatedFees: currentState.accumulatedFees.toString()
//     });

//     const programState = await program.account.programState.fetch(programStatePda);
//     console.log("Program state owner:", programState.owner.toBase58());
//     console.log("Wallet pubkey:", provider.wallet.publicKey.toBase58());

//     const eventId = programState.nextEventId;
//     const [eventPda] = PublicKey.findProgramAddressSync(
//         [Buffer.from("event"), new anchor.BN(eventId).toBuffer("le", 8)],
//         program.programId
//     );

//     // Create event with voucher amount
//     try {
//         await program.methods.createEvent(
//             "Voucher Test Event",
//             new anchor.BN(Math.floor(Date.now() / 1000) + 3600),
//             new anchor.BN(Math.floor(Date.now() / 1000) + 86400),
//             ["Team A", "Team B"],
//             voucherAmount
//         ).accounts({
//             programState: programStatePda,
//             event: eventPda,
//             owner: provider.wallet.publicKey,
//             systemProgram: SystemProgram.programId,
//         }).rpc();

//         // Verify event
//         const eventAccount = await program.account.event.fetch(eventPda);
//         const finalProgramState = await program.account.programState.fetch(programStatePda);

//         assert.equal(
//             eventAccount.voucherAmount.toString(),
//             voucherAmount.toString(),
//             "Event voucher amount not set correctly"
//         );
//         assert.equal(
//             eventAccount.totalVoucherClaimed.toString(),
//             "0",
//             "Initial voucher claimed should be 0"
//         );
//         assert.equal(
//             finalProgramState.activeVouchersAmount.toString(),
//             voucherAmount.toString(),
//             "Program active vouchers not updated correctly"
//         );
//     } catch (error) {
//         console.error("Failed to create event:", error);
//         if ((error as any).logs) {
//             console.error("Program logs:", (error as any).logs);
//         }
//         throw error;
//     }
//   });

//   it("should fail to create event with excessive voucher amount", async () => {
//     const voucherAmount = new anchor.BN(1000000000);    
//     const programState = await program.account.programState.fetch(programStatePda);
//         const eventId = programState.nextEventId;
//         const [eventPda] = PublicKey.findProgramAddressSync(
//                 [Buffer.from("event"), new anchor.BN(eventId).toBuffer("le", 8)],
//                 program.programId
//             );
    
//             const excessiveAmount = voucherAmount.mul(new anchor.BN(2));
    
//             try {
//                 await program.methods.createEvent(
//                     "Excessive Voucher Event",
//                     new anchor.BN(Math.floor(Date.now() / 1000) + 3600),
//                     new anchor.BN(Math.floor(Date.now() / 1000) + 86400),
//                     ["Team A", "Team B"],
//                     excessiveAmount
//                 ).accounts({
//                     programState: programStatePda,
//                     event: eventPda,
//                     owner: provider.wallet.publicKey,
//                     systemProgram: SystemProgram.programId,
//                 }).rpc();
                
//                 assert.fail("Should have failed with InsufficientProtocolFees");
//             } catch (error: any) {
//                 assert.include(error.toString(), "InsufficientProtocolFees");
//             }
//     });

//   it("should fail to create event with past start time", async () => {
//     try {
//       const programState = await program.account.programState.fetch(programStatePda);
//       const eventId = programState.nextEventId;
//       const [eventPda] = PublicKey.findProgramAddressSync(
//         [Buffer.from("event"), new anchor.BN(eventId).toBuffer("le", 8)],
//         program.programId
//       );

//       const pastTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour in the past
      
//       await program.methods.createEvent(
//         "Past Event",
//         new anchor.BN(pastTime),
//         new anchor.BN(pastTime + 86400),
//         ["Team A", "Team B"],
//         new anchor.BN(0)
//       ).accounts({
//         programState: programStatePda,
//         event: eventPda,
//         owner: provider.wallet.publicKey,
//         systemProgram: SystemProgram.programId,
//       }).rpc();

//       assert.fail("Should have failed with DeadlineInThePast");
//     } catch (error: any) {
//       assert.include(error.toString(), "DeadlineInThePast");
//     }
//   });

//   it("should fail to create event with deadline before start time", async () => {
//     try {
//       const programState = await program.account.programState.fetch(programStatePda);
//       const eventId = programState.nextEventId;
//       const [eventPda] = PublicKey.findProgramAddressSync(
//         [Buffer.from("event"), new anchor.BN(eventId).toBuffer("le", 8)],
//         program.programId
//       );

//       const startTime = Math.floor(Date.now() / 1000) + 3600;
//       const deadline = startTime - 1800; // 30 minutes before start time
      
//       await program.methods.createEvent(
//         "Invalid Deadline Event",
//         new anchor.BN(startTime),
//         new anchor.BN(deadline),
//         ["Team A", "Team B"],
//         new anchor.BN(0)
//       ).accounts({
//         programState: programStatePda,
//         event: eventPda,
//         owner: provider.wallet.publicKey,
//         systemProgram: SystemProgram.programId,
//       }).rpc();

//       assert.fail("Should have failed with DeadlineInThePast");
//     } catch (error: any) {
//       assert.include(error.toString(), "DeadlineInThePast");
//     }
//   });

//   it("should fail to create event with empty outcomes", async () => {
//     try {
//       const programState = await program.account.programState.fetch(programStatePda);
//       const eventId = programState.nextEventId;
//       const [eventPda] = PublicKey.findProgramAddressSync(
//         [Buffer.from("event"), new anchor.BN(eventId).toBuffer("le", 8)],
//         program.programId
//       );

//       await program.methods.createEvent(
//         "No Outcomes Event",
//         new anchor.BN(Math.floor(Date.now() / 1000) + 3600),
//         new anchor.BN(Math.floor(Date.now() / 1000) + 86400),
//         [], // Empty outcomes
//         new anchor.BN(0)
//       ).accounts({
//         programState: programStatePda,
//         event: eventPda,
//         owner: provider.wallet.publicKey,
//         systemProgram: SystemProgram.programId,
//       }).rpc();

//       assert.fail("Should have failed with NoOutcomesSpecified");
//     } catch (error: any) {
//       assert.include(error.toString(), "NoOutcomesSpecified");
//     }
//   });

//   it("should successfully create event with multiple outcomes", async () => {
//     const programState = await program.account.programState.fetch(programStatePda);
//     const eventId = programState.nextEventId;
//     const [eventPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("event"), new anchor.BN(eventId).toBuffer("le", 8)],
//       program.programId
//     );

//     const multipleOutcomes = ["Team A", "Team B", "Draw", "Cancelled"];
    
//     await program.methods.createEvent(
//       "Multi-Outcome Event",
//       new anchor.BN(Math.floor(Date.now() / 1000) + 3600),
//       new anchor.BN(Math.floor(Date.now() / 1000) + 86400),
//       multipleOutcomes,
//       new anchor.BN(0)
//     ).accounts({
//       programState: programStatePda,
//       event: eventPda,
//       owner: provider.wallet.publicKey,
//       systemProgram: SystemProgram.programId,
//     }).rpc();

//     const eventAccount = await program.account.event.fetch(eventPda);
//     assert.deepEqual(eventAccount.possibleOutcomes, multipleOutcomes);
//     assert.equal(eventAccount.totalBetsByOutcome.length, multipleOutcomes.length);
//     assert.deepEqual(eventAccount.totalBetsByOutcome.map(b => b.toNumber()), [0, 0, 0, 0]);
//   });

//   // Helper function to create an event for betting tests
//   async function createTestEvent(description: string): Promise<PublicKey> {
//     const programState = await program.account.programState.fetch(programStatePda);
//     const eventId = programState.nextEventId;
    
//     const [eventPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("event"), new anchor.BN(eventId).toBuffer("le", 8)],
//       program.programId
//     );

//     await program.methods.createEvent(
//       description,
//       new anchor.BN(Math.floor(Date.now() / 1000) + 3600),
//       new anchor.BN(Math.floor(Date.now() / 1000) + 86400),
//       ["Team A", "Team B"],
//       new anchor.BN(0)
//     ).accounts({
//       programState: programStatePda,
//       event: eventPda,
//       owner: provider.wallet.publicKey,
//       systemProgram: SystemProgram.programId,
//     }).rpc();

//     return eventPda;
//   }

//   describe("place_bet", () => {
//     let eventPda: PublicKey;
//     let userBetPda: PublicKey;
//     let eventPoolPda: PublicKey;
//     let betAmount: anchor.BN;
//     let userTokenAccount: PublicKey;
//     let eventPoolTokenAccount: PublicKey;
//     let eventId: number;
//     let mint: PublicKey;

//     beforeEach(async () => {
//         // Create mint
//         mint = await createMint(
//             provider.connection,
//             provider.wallet.payer,
//             provider.wallet.publicKey,
//             provider.wallet.publicKey, // Mint authority
//             9 // Decimals
//         );

//         // Setup user token account
//         userTokenAccount = await getAssociatedTokenAddress(mint, provider.wallet.publicKey);
//         const tx = new Transaction().add(
//             createAssociatedTokenAccountInstruction(
//                 provider.wallet.publicKey,
//                 userTokenAccount,
//                 provider.wallet.publicKey,
//                 mint
//             )
//         );
//         await provider.sendAndConfirm(tx);

//         // Fund user token account
//         await mintTo(
//             provider.connection,
//             provider.wallet.payer,
//             mint,
//             userTokenAccount,
//             provider.wallet.publicKey, // Mint authority
//             1000000000
//         );

//         // Create event
//         eventPda = await createTestEvent("Betting Test Event");
//         const eventAccount = await program.account.event.fetch(eventPda);
//         eventId = eventAccount.id.toNumber();

//         // Create event pool PDA
//         [eventPoolPda] = await PublicKey.findProgramAddressSync(
//             [
//                 Buffer.from("event"),
//                 new anchor.BN(eventId).toArrayLike(Buffer, "le", 8),
//                 Buffer.from("pool"),
//             ],
//             program.programId
//         );

//         console.log("=== Debug Info ===");
//         console.log("Event ID:", eventId);
//         console.log("Event Pool Seeds:", {
//             event: Buffer.from("event").toString("hex"),
//             eventId: new anchor.BN(eventId).toArrayLike(Buffer, "le", 8).toString("hex"),
//             pool: Buffer.from("pool").toString("hex")
//         });
//         console.log("Event PDA:", eventPda.toBase58());
//         console.log("Event Pool PDA:", eventPoolPda.toBase58());

//         // Initialize event pool with PDA
//         try {
//             await program.methods.initializeEventPool().accounts({
//                 event: eventPda,
//                 eventPool: eventPoolPda,
//                 payer: provider.wallet.publicKey,
//                 tokenMint: mint,
//                 systemProgram: SystemProgram.programId,
//                 tokenProgram: TOKEN_PROGRAM_ID,
//                 rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//             }).rpc();
//         } catch (error) {
//             console.error("Failed to initialize event pool:", error);
//             throw error;
//         }

//         // Create user bet PDA
//         [userBetPda] = PublicKey.findProgramAddressSync(
//             [
//                 Buffer.from("user_bet"),
//                 provider.wallet.publicKey.toBuffer(),
//                 new anchor.BN(eventId).toArrayLike(Buffer, "le", 8),
//             ],
//             program.programId
//         );

//         // Initialize user bet account
//         await program.methods.initializeUserBet().accounts({
//             userBet: userBetPda,
//             event: eventPda,
//             user: provider.wallet.publicKey,
//             systemProgram: SystemProgram.programId,
//         }).rpc();

//         betAmount = new anchor.BN(100000000);
//     });

//     it("should successfully place a bet", async () => {
//         await program.methods.placeBet("Team A", betAmount).accounts({
//             event: eventPda,
//             userBet: userBetPda,
//             userTokenAccount: userTokenAccount,
//             eventPool: eventPoolPda,
//             user: provider.wallet.publicKey,
//             tokenProgram: TOKEN_PROGRAM_ID,
//         }).rpc();

//         // Verify bet was placed correctly
//         const userBetAccount = await program.account.userBet.fetch(userBetPda);
//         const eventAccount = await program.account.event.fetch(eventPda);
//         const eventPoolAccount = await getAccount(provider.connection, eventPoolPda);

//         assert.equal(userBetAccount.amount.toString(), betAmount.toString());
//         assert.equal(eventAccount.totalPool.toString(), betAmount.toString());
//         assert.equal(eventPoolAccount.amount.toString(), betAmount.toString());
//     });

//     it("should successfully place multiple bets on the same outcome", async () => {
//         // Place first bet
//         await program.methods.placeBet("Team A", betAmount).accounts({
//             event: eventPda,
//             userBet: userBetPda,
//             userTokenAccount: userTokenAccount,
//             eventPool: eventPoolPda,
//             user: provider.wallet.publicKey,
//             tokenProgram: TOKEN_PROGRAM_ID,
//         }).rpc();

//         // Place second bet
//         await program.methods.placeBet("Team A", betAmount).accounts({
//             event: eventPda,
//             userBet: userBetPda,
//             userTokenAccount: userTokenAccount,
//             eventPool: eventPoolPda,
//             user: provider.wallet.publicKey,
//             tokenProgram: TOKEN_PROGRAM_ID,
//         }).rpc();

//         const userBetAccount = await program.account.userBet.fetch(userBetPda);
//         const eventAccount = await program.account.event.fetch(eventPda);

//         assert.equal(userBetAccount.amount.toString(), betAmount.mul(new anchor.BN(2)).toString(), "Total bet amount mismatch");
//         assert.equal(eventAccount.totalBetsByOutcome[0].toString(), betAmount.mul(new anchor.BN(2)).toString(), "Team A total bets mismatch");
//     });

//     it("should fail when betting on invalid outcome", async () => {
//         try {
//             await program.methods.placeBet("Invalid Team", betAmount).accounts({
//                 event: eventPda,
//                 userBet: userBetPda,
//                 userTokenAccount: userTokenAccount,
//                 eventPool: eventPoolPda,
//                 user: provider.wallet.publicKey,
//                 tokenProgram: TOKEN_PROGRAM_ID,
//             }).rpc();
//             assert.fail("Should have failed with InvalidOutcome");
//         } catch (error: any) {
//             assert.include(error.toString(), "InvalidOutcome");
//         }
//     });

//     it("should fail when betting with zero amount", async () => {
//         try {
//             await program.methods.placeBet("Team A", new anchor.BN(0)).accounts({
//                 event: eventPda,
//                 userBet: userBetPda,
//                 userTokenAccount: userTokenAccount,
//                 eventPool: eventPoolPda,
//                 user: provider.wallet.publicKey,
//                 tokenProgram: TOKEN_PROGRAM_ID,
//             }).rpc();
//             assert.fail("Should have failed with BetAmountZero");
//         } catch (error: any) {
//             assert.include(error.toString(), "BetAmountZero");
//         }
//     });

//     it("should fail when betting after deadline", async () => {
//         // Create event with a future deadline first
//         const pastEventPda = await createTestEvent("Past Deadline Event");
//         const pastEvent = await program.account.event.fetch(pastEventPda);
//         const pastEventId = pastEvent.id.toNumber();

//         // Calculate PDAs for this event
//         [eventPoolPda] = PublicKey.findProgramAddressSync(
//             [
//                 Buffer.from("event"),
//                 new anchor.BN(pastEventId).toArrayLike(Buffer, "le", 8),
//                 Buffer.from("pool"),
//             ],
//             program.programId
//         );

//         [userBetPda] = PublicKey.findProgramAddressSync(
//             [
//                 Buffer.from("user_bet"),
//                 provider.wallet.publicKey.toBuffer(),
//                 new anchor.BN(pastEventId).toArrayLike(Buffer, "le", 8),
//             ],
//             program.programId
//         );

//         // Initialize the event pool
//         await program.methods.initializeEventPool().accounts({
//             event: pastEventPda,
//             eventPool: eventPoolPda,
//             payer: provider.wallet.publicKey,
//             tokenMint: mint,
//             systemProgram: SystemProgram.programId,
//             tokenProgram: TOKEN_PROGRAM_ID,
//             rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//         }).rpc();

//         // Initialize user bet account
//         await program.methods.initializeUserBet().accounts({
//             userBet: userBetPda,
//             event: pastEventPda,
//             user: provider.wallet.publicKey,
//             systemProgram: SystemProgram.programId,
//         }).rpc();
        
//         // Wait for a moment to ensure the deadline passes
//         console.log("Waiting for event deadline to pass...");
//         await new Promise(resolve => setTimeout(resolve, 2000));

//         try {
//             await program.methods.placeBet("Team A", betAmount).accounts({
//                 event: pastEventPda,
//                 userBet: userBetPda,
//                 userTokenAccount: userTokenAccount,
//                 eventPool: eventPoolPda,
//                 user: provider.wallet.publicKey,
//                 tokenProgram: TOKEN_PROGRAM_ID,
//             }).rpc();
//             assert.fail("Should have failed with BettingClosed");
//         } catch (error: any) {
//             assert.include(error.toString(), "BettingClosed");
//         }
//     });

//     it("should fail when trying to bet on different outcome", async () => {
//         // Place first bet on Team A
//         await program.methods.placeBet("Team A", betAmount).accounts({
//             event: eventPda,
//             userBet: userBetPda,
//             userTokenAccount: userTokenAccount,
//             eventPool: eventPoolPda,
//             user: provider.wallet.publicKey,
//             tokenProgram: TOKEN_PROGRAM_ID,
//         }).rpc();

//         // Try to bet on Team B with same user bet account
//         try {
//             await program.methods.placeBet("Team B", betAmount).accounts({
//                 event: eventPda,
//                 userBet: userBetPda,
//                 userTokenAccount: userTokenAccount,
//                 eventPool: eventPoolPda,
//                 user: provider.wallet.publicKey,
//                 tokenProgram: TOKEN_PROGRAM_ID,
//             }).rpc();
//             assert.fail("Should have failed with InvalidOutcome");
//         } catch (error: any) {
//             assert.include(error.toString(), "InvalidOutcome");
//         }
//     });

//     it("should fail when user has insufficient funds", async () => {
//         // Create new keypair for poor user
//         const poorUserKeypair = Keypair.generate();
        
//         // Airdrop SOL for transaction fees
//         const airdropSig = await provider.connection.requestAirdrop(poorUserKeypair.publicKey, 1000000000);
//         await provider.connection.confirmTransaction(airdropSig);

//         // Create token account for poor user
//         const poorUserTokenAccount = await getAssociatedTokenAddress(mint, poorUserKeypair.publicKey);
//         const createAtaTx = new Transaction().add(
//             createAssociatedTokenAccountInstruction(
//                 provider.wallet.publicKey,
//                 poorUserTokenAccount,
//                 poorUserKeypair.publicKey,
//                 mint
//             )
//         );
//         await provider.sendAndConfirm(createAtaTx);

//         // Note: We don't mint any tokens to this account, so it has 0 balance

//         // Create user bet PDA for poor user
//         const [poorUserBetPda] = PublicKey.findProgramAddressSync(
//             [
//                 Buffer.from("user_bet"),
//                 poorUserKeypair.publicKey.toBuffer(),
//                 new anchor.BN(eventId).toArrayLike(Buffer, "le", 8),
//             ],
//             program.programId
//         );

//         // Initialize user bet account
//         await program.methods.initializeUserBet().accounts({
//             userBet: poorUserBetPda,
//             event: eventPda,
//             user: poorUserKeypair.publicKey,
//             systemProgram: SystemProgram.programId,
//         }).signers([poorUserKeypair]).rpc();

//         try {
//             // Try to bet with no tokens
//             await program.methods.placeBet("Team A", betAmount).accounts({
//                 event: eventPda,
//                 userBet: poorUserBetPda,
//                 userTokenAccount: poorUserTokenAccount,
//                 eventPool: eventPoolPda,
//                 user: poorUserKeypair.publicKey,
//                 tokenProgram: TOKEN_PROGRAM_ID,
//             }).signers([poorUserKeypair]).rpc();
            
//             assert.fail("Should have failed due to insufficient funds");
//         } catch (error: any) {
//             // The exact error message from Token Program
//             assert.include(
//                 error.toString(),
//                 "custom program error: 0x1", // Token Program's insufficient funds error
//                 "Should fail with insufficient funds error"
//             );
//         }

//         // Verify no bet was placed
//         const userBetAccount = await program.account.userBet.fetch(poorUserBetPda);
//         assert.equal(userBetAccount.amount.toString(), "0", "Bet amount should still be 0");
//     });
//   });

//   describe("revoke_event", () => {
//     let eventPda: PublicKey;
//     let eventId: number;
//     const VOUCHER_AMOUNT = new anchor.BN(1000000000);

//     beforeEach(async () => {
//         console.log("=== Revoke Event Test Setup ===");

//         // Reset program state accumulated fees
//         const currentState = await program.account.programState.fetch(programStatePda);
        

//         // Now continue with the test setup...
//         // Ensure shared token account has enough funds
//         await mintTo(
//             provider.connection,
//             provider.wallet.payer,
//             mint,
//             sharedUserTokenAccount,
//             provider.wallet.publicKey,
//             2000000000
//         );

//         // // Add voucher funds for our test
//         // await program.methods.addVoucherFunds(VOUCHER_AMOUNT)
//         //     .accounts({
//         //         programState: programStatePda,
//         //         userTokenAccount: sharedUserTokenAccount,
//         //         feePool: feePoolPda,
//         //         fundSource: provider.wallet.publicKey,
//         //         tokenProgram: TOKEN_PROGRAM_ID,
//         //         systemProgram: SystemProgram.programId,
//         //     }).rpc();

//         // Get the current state for event creation
//         const programState = await program.account.programState.fetch(programStatePda);
//         eventId = programState.nextEventId;
//         [eventPda] = PublicKey.findProgramAddressSync(
//             [Buffer.from("event"), new anchor.BN(eventId).toBuffer("le", 8)],
//             program.programId
//         );

//         // Create event with voucher amount
//         await program.methods.createEvent(
//             "Revoke Test Event",
//             new anchor.BN(Math.floor(Date.now() / 1000) + 3600),
//             new anchor.BN(Math.floor(Date.now() / 1000) + 86400),
//             ["Outcome 1", "Outcome 2"],
//             new anchor.BN(0)
//         ).accounts({
//             programState: programStatePda,
//             event: eventPda,
//             owner: provider.wallet.publicKey,
//             systemProgram: SystemProgram.programId,
//         }).rpc();

//         // Verify initial state
//         const initialState = await program.account.programState.fetch(programStatePda);
//         console.log("Initial state:", {
//             activeVouchers: initialState.activeVouchersAmount.toString(),
//             eventVoucher: (await program.account.event.fetch(eventPda)).voucherAmount.toString(),
//         });
//     });

//     it("should successfully revoke the event", async () => {
//         // Get initial state
//         const initialState = await program.account.programState.fetch(programStatePda);
//         const initialEvent = await program.account.event.fetch(eventPda);
        
//         console.log("Before revoke:", {
//             activeVouchers: initialState.activeVouchersAmount.toString(),
//             eventVoucher: initialEvent.voucherAmount.toString(),
//         });

//         // Perform revoke
//         await program.methods.revokeEvent().accounts({
//             programState: programStatePda,
//             event: eventPda,
//             owner: provider.wallet.publicKey,
//         }).rpc();

//         // Get final state
//         const finalState = await program.account.programState.fetch(programStatePda);
//         const finalEvent = await program.account.event.fetch(eventPda);
        
//         console.log("After revoke:", {
//             activeVouchers: finalState.activeVouchersAmount.toString(),
//             eventVoucher: finalEvent.voucherAmount.toString(),
//         });
//     });

//     it("should fail to revoke an event that has started", async () => {
//         try {
//             const now = Math.floor(Date.now() / 1000);
//             const pastTime = now - 3600; // 1 hour ago
//             const futureDeadline = now + 3600; // 1 hour from now

//             // Add voucher funds for the new event
//             await program.methods.addVoucherFunds(VOUCHER_AMOUNT)
//                 .accounts({
//                     programState: programStatePda,
//                     userTokenAccount: sharedUserTokenAccount,
//                     feePool: feePoolPda,
//                     fundSource: provider.wallet.publicKey,
//                     tokenProgram: TOKEN_PROGRAM_ID,
//                     systemProgram: SystemProgram.programId,
//                 }).rpc();

//             const programState = await program.account.programState.fetch(programStatePda);
//             const newEventId = programState.nextEventId;
//             const [newEventPda] = PublicKey.findProgramAddressSync(
//                 [Buffer.from("event"), new anchor.BN(newEventId).toBuffer("le", 8)],
//                 program.programId
//             );

//             // Create event in the past
//             await program.methods.createEvent(
//                 "Started Event",
//                 new anchor.BN(pastTime),
//                 new anchor.BN(futureDeadline),
//                 ["Outcome 1", "Outcome 2"],
//                 new anchor.BN(0)
//             ).accounts({
//                 programState: programStatePda,
//                 event: newEventPda,
//                 owner: provider.wallet.publicKey,
//                 systemProgram: SystemProgram.programId,
//             }).rpc();

//             // Then try to revoke it
//             await program.methods.revokeEvent().accounts({
//                 programState: programStatePda,
//                 event: newEventPda,
//                 owner: provider.wallet.publicKey,
//             }).rpc();

//             assert.fail("Should have failed with EventCannotBeEnded");
//         } catch (error: any) {
//             assert.include(error.toString(), "EventCannotBeEnded");
//         }
//     });

//     it("should fail to revoke an event that has active bets", async () => {
//         try {
//             // Add voucher funds for the new event
//             await program.methods.addVoucherFunds(VOUCHER_AMOUNT)
//                 .accounts({
//                     programState: programStatePda,
//                     userTokenAccount: sharedUserTokenAccount,
//                     feePool: feePoolPda,
//                     fundSource: provider.wallet.publicKey,
//                     tokenProgram: TOKEN_PROGRAM_ID,
//                     systemProgram: SystemProgram.programId,
//                 }).rpc();

//             // Create a new event for betting
//             const programState = await program.account.programState.fetch(programStatePda);
//             const newEventId = programState.nextEventId;
//             const [newEventPda] = PublicKey.findProgramAddressSync(
//                 [Buffer.from("event"), new anchor.BN(newEventId).toBuffer("le", 8)],
//                 program.programId
//             );

//             // Create event with future start time
//             await program.methods.createEvent(
//                 "Betting Event",
//                 new anchor.BN(Math.floor(Date.now() / 1000) + 3600),
//                 new anchor.BN(Math.floor(Date.now() / 1000) + 86400),
//                 ["Outcome 1", "Outcome 2"],
//                 new anchor.BN(0)
//             ).accounts({
//                 programState: programStatePda,
//                 event: newEventPda,
//                 owner: provider.wallet.publicKey,
//                 systemProgram: SystemProgram.programId,
//             }).rpc();

//             // Setup for placing bet
//             const [eventPoolPda] = await PublicKey.findProgramAddressSync(
//                 [Buffer.from("event"), new anchor.BN(newEventId).toBuffer("le", 8), Buffer.from("pool")],
//                 program.programId
//             );

//             // Create and initialize event pool
//             await program.methods.initializeEventPool().accounts({
//                 event: newEventPda,
//                 eventPool: eventPoolPda,
//                 payer: provider.wallet.publicKey,
//                 tokenMint: mint,
//                 systemProgram: SystemProgram.programId,
//                 tokenProgram: TOKEN_PROGRAM_ID,
//                 rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//             }).rpc();

//             // Create user bet PDA
//             const [newUserBetPda] = PublicKey.findProgramAddressSync(
//                 [
//                     Buffer.from("user_bet"),
//                     provider.wallet.publicKey.toBuffer(),
//                     new anchor.BN(newEventId).toBuffer("le", 8),
//                 ],
//                 program.programId
//             );

//             // Initialize user bet account
//             await program.methods.initializeUserBet().accounts({
//                 userBet: newUserBetPda,
//                 event: newEventPda,
//                 user: provider.wallet.publicKey,
//                 systemProgram: SystemProgram.programId,
//             }).rpc();

//             // Place a bet
//             await program.methods.placeBet("Outcome 1", new anchor.BN(100000000))
//                 .accounts({
//                     event: newEventPda,
//                     userBet: newUserBetPda,
//                     userTokenAccount: sharedUserTokenAccount,
//                     eventPool: eventPoolPda,
//                     user: provider.wallet.publicKey,
//                     tokenProgram: TOKEN_PROGRAM_ID,
//                 }).rpc();

//             // Try to revoke the event
//             await program.methods.revokeEvent().accounts({
//                 programState: programStatePda,
//                 event: newEventPda,
//                 owner: provider.wallet.publicKey,
//             }).rpc();

//             assert.fail("Should have failed with EventHasBets");
//         } catch (error: any) {
//             assert.include(error.toString(), "EventHasBets");
//         }
//     });

//     it("should fail when a non-owner tries to revoke the event", async () => {
//       try {
//         // Create a new keypair for a non-owner
//         const nonOwner = anchor.web3.Keypair.generate();

//         // Airdrop some SOL to the non-owner account
//         await provider.connection.requestAirdrop(nonOwner.publicKey, 1000000000);
//         await provider.connection.confirmTransaction(
//           await provider.connection.requestAirdrop(nonOwner.publicKey, 1000000000)
//         );

//         // Attempt to revoke the event using the non-owner account
//         await program.methods.revokeEvent().accounts({
//           programState: programStatePda,
//           event: eventPda,
//           owner: nonOwner.publicKey,
//         }).signers([nonOwner]).rpc();

//         assert.fail("Should have failed with Unauthorized");
//       } catch (error: any) {
//         console.error("Error revoking event by non-owner:", error);
//         assert.include(error.toString(), "Unauthorized");
//       }
//     });
//   });

//   describe("update_fee_percentage", () => {
//     it("should successfully update the fee percentage", async () => {
//       const newFeePercentage = new anchor.BN(200); // 2% fee

//       // Update the fee percentage
//       await program.methods.updateFeePercentage(newFeePercentage).accounts({
//         programState: programStatePda,
//         owner: provider.wallet.publicKey,
//       }).rpc();

//       // Verify the program state was updated correctly
//       const programState = await program.account.programState.fetch(programStatePda);
//       assert.equal(programState.feePercentage.toString(), newFeePercentage.toString(), "Fee percentage mismatch");
//     });

//     it("should fail when a non-owner tries to update the fee percentage", async () => {
//       try {
//         // Create a new keypair for a non-owner
//         const nonOwner = anchor.web3.Keypair.generate();

//         // Airdrop some SOL to the non-owner account
//         await provider.connection.requestAirdrop(nonOwner.publicKey, 1000000000);
//         await provider.connection.confirmTransaction(
//           await provider.connection.requestAirdrop(nonOwner.publicKey, 1000000000)
//         );

//         const newFeePercentage = new anchor.BN(300); // 3% fee

//         // Attempt to update the fee percentage using the non-owner account
//         await program.methods.updateFeePercentage(newFeePercentage).accounts({
//           programState: programStatePda,
//           owner: nonOwner.publicKey,
//         }).signers([nonOwner]).rpc();

//         assert.fail("Should have failed with Unauthorized");
//       } catch (error: any) {
//         assert.include(error.toString(), "Unauthorized");
//       }
//     });
//   });

//   describe("increase_deadline", () => {
//     let eventPda: PublicKey;
//     let eventId: number;

//     before(async () => {
//       // Create an event for testing
//       const programState = await program.account.programState.fetch(programStatePda);
//       eventId = programState.nextEventId;

//       [eventPda] = PublicKey.findProgramAddressSync(
//         [Buffer.from("event"), new anchor.BN(eventId).toBuffer("le", 8)],
//         program.programId
//       );

//       await program.methods.createEvent(
//         "Increase Deadline Test Event",
//         new anchor.BN(Math.floor(Date.now() / 1000) + 3600),
//         new anchor.BN(Math.floor(Date.now() / 1000) + 86400),
//         ["Outcome 1", "Outcome 2"],
//         new anchor.BN(0) // Initial voucher amount
//       ).accounts({
//         programState: programStatePda,
//         event: eventPda,
//         owner: provider.wallet.publicKey,
//         systemProgram: SystemProgram.programId,
//       }).rpc();
//     });

//     it("should successfully increase the deadline", async () => {
//       const newDeadline = Math.floor(Date.now() / 1000) + 172800; // 2 days from now

//       // Increase the deadline
//       await program.methods.increaseDeadline(new anchor.BN(newDeadline)).accounts({
//         programState: programStatePda,
//         event: eventPda,
//         owner: provider.wallet.publicKey,
//       }).rpc();

//       // Verify the event account was updated correctly
//       const eventAccount = await program.account.event.fetch(eventPda);
//       assert.equal(eventAccount.deadline.toNumber(), newDeadline, "Deadline mismatch");
//     });

//     it("should fail when a non-owner tries to increase the deadline", async () => {
//       try {
//         // Create a new keypair for a non-owner
//         const nonOwner = anchor.web3.Keypair.generate();

//         // Airdrop some SOL to the non-owner account
//         await provider.connection.requestAirdrop(nonOwner.publicKey, 1000000000);
//         await provider.connection.confirmTransaction(
//           await provider.connection.requestAirdrop(nonOwner.publicKey, 1000000000)
//         );

//         const newDeadline = Math.floor(Date.now() / 1000) + 172800; // 2 days from now

//         // Attempt to increase the deadline using the non-owner account
//         await program.methods.increaseDeadline(new anchor.BN(newDeadline)).accounts({
//           programState: programStatePda,
//           event: eventPda,
//           owner: nonOwner.publicKey,
//         }).signers([nonOwner]).rpc();

//         assert.fail("Should have failed with Unauthorized");
//       } catch (error: any) {
//         assert.include(error.toString(), "Unauthorized");
//       }
//     });

//     it("should fail to decrease the deadline", async () => {
//       try {
//         const newDeadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

//         // Attempt to decrease the deadline
//         await program.methods.increaseDeadline(new anchor.BN(newDeadline)).accounts({
//           programState: programStatePda,
//           event: eventPda,
//           owner: provider.wallet.publicKey,
//         }).rpc();

//         assert.fail("Should have failed with DeadlineInThePast");
//       } catch (error: any) {
//         assert.include(error.toString(), "DeadlineInThePast");
//       }
//     });
//   });

//   describe("resolve_event", () => {
//     let eventPda: PublicKey;
//     let eventId: number;

//     beforeEach(async () => {
//         const now = Math.floor(Date.now() / 1000);
//         const programState = await program.account.programState.fetch(programStatePda);
//         eventId = programState.nextEventId;

//         [eventPda] = PublicKey.findProgramAddressSync(
//             [Buffer.from("event"), new anchor.BN(eventId).toBuffer("le", 8)],
//             program.programId
//         );

//         // Create event with future start time but past deadline when we resolve
//         await program.methods.createEvent(
//             "Resolve Test Event",
//             new anchor.BN(now + 1), // Start time just slightly in future
//             new anchor.BN(now + 2), // Deadline shortly after start
//             ["Outcome 1", "Outcome 2"],
//             new anchor.BN(0)
//         ).accounts({
//             programState: programStatePda,
//             event: eventPda,
//             owner: provider.wallet.publicKey,
//             systemProgram: SystemProgram.programId,
//         }).rpc();

//         // Wait for the deadline to pass
//         await new Promise(resolve => setTimeout(resolve, 3000));

//         // Verify event was created and time has passed
//         const event = await program.account.event.fetch(eventPda);
//         const currentTime = Math.floor(Date.now() / 1000);
//         console.log("Event timing:", {
//             startTime: event.startTime.toString(),
//             deadline: event.deadline.toString(),
//             currentTime: currentTime
//         });
//     });

//     it("should successfully resolve the event", async () => {
//         await program.methods.resolveEvent("Outcome 1").accounts({
//             programState: programStatePda,
//             event: eventPda,
//             owner: provider.wallet.publicKey,
//         }).rpc();

//         const eventAccount = await program.account.event.fetch(eventPda);
//         assert.equal(eventAccount.winningOutcome.toString(), "Outcome 1");
//     });

//     it("should fail when trying to resolve already resolved event", async () => {
//         // First resolution
//         await program.methods.resolveEvent("Outcome 1").accounts({
//             programState: programStatePda,
//             event: eventPda,
//             owner: provider.wallet.publicKey,
//         }).rpc();

//         try {
//             // Second resolution attempt
//             await program.methods.resolveEvent("Outcome 2").accounts({
//                 programState: programStatePda,
//                 event: eventPda,
//                 owner: provider.wallet.publicKey,
//             }).rpc();

//             assert.fail("Should have failed with EventAlreadyResolved");
//         } catch (error: any) {
//             console.log("Error:", error);
//             assert.include(error.toString(), "EventAlreadyResolved");
//         }
//     });

//     // ... rest of tests ...
// });

//   describe("update_signer", () => {
//     it("should successfully update the signer address", async () => {
//         const newSigner = Keypair.generate();

//         await program.methods.updateSigner(newSigner.publicKey).accounts({
//             programState: programStatePda,
//             owner: provider.wallet.publicKey,
//         }).rpc();

//         const programState = await program.account.programState.fetch(programStatePda);
//         assert.equal(
//             programState.signer.toBase58(),
//             newSigner.publicKey.toBase58(),
//             "Signer address mismatch"
//         );
//     });

//     it("should fail when non-owner tries to update signer", async () => {
//         try {
//             const nonOwner = Keypair.generate();
//             const newSigner = Keypair.generate();

//             await provider.connection.requestAirdrop(nonOwner.publicKey, 1000000000);
//             await provider.connection.confirmTransaction(
//                 await provider.connection.requestAirdrop(nonOwner.publicKey, 1000000000)
//             );

//             await program.methods.updateSigner(newSigner.publicKey).accounts({
//                 programState: programStatePda,
//                 owner: nonOwner.publicKey,
//             }).signers([nonOwner]).rpc();

//             assert.fail("Should have failed with Unauthorized");
//         } catch (error: any) {
//             assert.include(error.toString(), "Unauthorized");
//         }
//     });
// });

// describe("update_owner", () => {
//     it("should successfully update the owner address", async () => {
//         const newOwner = Keypair.generate();

//         await program.methods.updateOwner(newOwner.publicKey).accounts({
//             programState: programStatePda,
//             owner: provider.wallet.publicKey,
//         }).rpc();

//         const programState = await program.account.programState.fetch(programStatePda);
//         assert.equal(
//             programState.owner.toBase58(),
//             newOwner.publicKey.toBase58(),
//             "Owner address mismatch"
//         );
//     });

//     it("should fail when non-owner tries to update owner", async () => {
//         try {
//             const nonOwner = Keypair.generate();
//             const newOwner = Keypair.generate();

//             await provider.connection.requestAirdrop(nonOwner.publicKey, 1000000000);
//             await provider.connection.confirmTransaction(
//                 await provider.connection.requestAirdrop(nonOwner.publicKey, 1000000000)
//             );

//             await program.methods.updateOwner(newOwner.publicKey).accounts({
//                 programState: programStatePda,
//                 owner: nonOwner.publicKey,
//             }).signers([nonOwner]).rpc();

//             assert.fail("Should have failed with Unauthorized");
//         } catch (error: any) {
//             assert.include(error.toString(), "Unauthorized");
//         }
//     });
// });

// describe("withdraw_fees", () => {
//   const withdrawalAmount = new anchor.BN(500);
//   let initialFees: anchor.BN;
//   let ownerTokenAccount: PublicKey;

//   before(async () => {
//     // Fund fee pool by adding voucher funds
//     await program.methods.addVoucherFunds(new anchor.BN(1000))
//       .accounts({
//         programState: programStatePda,
//         userTokenAccount: sharedUserTokenAccount,
//         feePool: feePoolPda,
//         fundSource: provider.wallet.publicKey,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         systemProgram: SystemProgram.programId,
//       })
//       .rpc();
//     const state = await program.account.programState.fetch(programStatePda);
//     initialFees = new anchor.BN(state.accumulatedFees);
//     // Create owner token account (if not exists)
//     ownerTokenAccount = await getAssociatedTokenAddress(mint, provider.wallet.publicKey);
//   });

//   it("successfully withdraws fees", async () => {
//     console.log("!!!!!!!!!!!!!!!!!!!");
//     await program.methods.withdrawFees(withdrawalAmount)
//       .accounts({
//         programState: programStatePda,
//         feePool: feePoolPda,
//         feePoolTokenAccount: feePoolPda, // already provided
//         ownerTokenAccount: ownerTokenAccount, // Updated key to camelCase
//         owner: provider.wallet.publicKey,
//         program_authority: programStatePda,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         systemProgram: SystemProgram.programId,
//         rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//         clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
//       })
//       .rpc();
//     // ...existing assertions...
//   });

//   it("fails when withdrawing zero fees", async () => {
//     try {
//       await program.methods.withdrawFees(new anchor.BN(0))
//         .accounts({
//           programState: programStatePda,
//           feePool: feePoolPda,
//           feePoolTokenAccount: feePoolPda,
//           ownerTokenAccount: ownerTokenAccount, // Updated account key
//           owner: provider.wallet.publicKey,
//           program_authority: programStatePda,
//           tokenProgram: TOKEN_PROGRAM_ID,
//           systemProgram: SystemProgram.programId,
//           rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//           clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
//         })
//         .rpc();
//       assert.fail("Expected withdrawFees to throw an error when withdrawing zero fees");
//     } catch (error: any) {
//       console.log("withdraw zero fees error:", error.toString());
//       // Verify that the error message includes "WithdrawAmountZero"
//       assert.include(error.toString(), "WithdrawAmountZero");
//     }
//   });

//   it("fails when a non-owner tries to withdraw fees", async () => {
//     const nonOwner = Keypair.generate();
//     const airdropSig = await provider.connection.requestAirdrop(nonOwner.publicKey, 1000000000);
//     await provider.connection.confirmTransaction(airdropSig);
//     try {
//       await program.methods.withdrawFees(withdrawalAmount)
//         .accounts({
//           programState: programStatePda,
//           feePool: feePoolPda,
//           feePoolTokenAccount: feePoolPda,
//           ownerTokenAccount: ownerTokenAccount, // Updated account key
//           owner: nonOwner.publicKey, // non-owner
//           program_authority: programStatePda,
//           tokenProgram: TOKEN_PROGRAM_ID,
//           systemProgram: SystemProgram.programId,
//           rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//           clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
//         })
//         .signers([nonOwner])
//         .rpc();
//       assert.fail("Non-owner withdrawal should have failed");
//     } catch (err) {
//       assert.include(err.toString(), "Unauthorized");
//     }
//   });
// });
// });


