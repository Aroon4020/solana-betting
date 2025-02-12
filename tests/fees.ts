// import * as anchor from "@coral-xyz/anchor";
// import { Program } from "@coral-xyz/anchor";
// import { EventBetting } from "../target/types/event_betting";
// import { assert } from "chai";
// import {
//     createMint,
//     createAccount,
//     mintTo,
//     TOKEN_PROGRAM_ID,
//     getAccount,
//     getAssociatedTokenAddress,
//     createAssociatedTokenAccountInstruction,
// } from "@solana/spl-token";
// import { SystemProgram } from "@solana/web3.js";

// describe("withdraw_fees", () => {
//     const provider = anchor.AnchorProvider.env();
//     anchor.setProvider(provider);
//     const program = anchor.workspace.EventBetting as Program<EventBetting>;

//     let mint: anchor.web3.PublicKey;
//     let eventId: number;
//     let event: anchor.web3.PublicKey;
//     let userTokenAccount: anchor.web3.PublicKey;
//     let eventPool: anchor.web3.PublicKey;
//     let userBet: anchor.web3.PublicKey;
//     let programState: anchor.web3.PublicKey;
//     let user: anchor.web3.Keypair;
//     let programAuthority: anchor.web3.PublicKey;
//     let feePool: anchor.web3.PublicKey;
//     let feePoolTokenAccount: anchor.web3.PublicKey; // Add declaration for feePoolTokenAccount
//     const WITHDRAW_AMOUNT = new anchor.BN(500);

//     before(async () => {
//         // Create new keypair for user
//         user = anchor.web3.Keypair.generate();
//         console.log("User public key: ", user.publicKey.toBase58());
//         // Airdrop SOL to user
//         const signature = await provider.connection.requestAirdrop(
//             user.publicKey,
//             2 * anchor.web3.LAMPORTS_PER_SOL
//         );
//         console.log("Airdrop signature: ", signature);
//         await provider.connection.confirmTransaction(signature);

//         // Create token mint
//         mint = await createMint(
//             provider.connection,
//             user,
//             user.publicKey,
//             null,
//             6
//         );
//         console.log("Mint: ", mint.toBase58());

//         // Create user token account
//         userTokenAccount = await getAssociatedTokenAddress(
//             mint,
//             user.publicKey
//         );
//         console.log("User token account: ", userTokenAccount.toBase58());

//         // Create the token account
//         const createATAIx = createAssociatedTokenAccountInstruction(
//             user.publicKey,
//             userTokenAccount,
//             user.publicKey,
//             mint
//         );
//         const tx = new anchor.web3.Transaction().add(createATAIx);
//         await provider.sendAndConfirm(tx, [user]);
//         console.log("User token account created");

//         // Mint tokens to user
//         await mintTo(
//             provider.connection,
//             user,
//             mint,
//             userTokenAccount,
//             user.publicKey,
//             1000000000 // 1000 tokens
//         );
//         console.log("Tokens minted to user");
//         // Initialize program state
//         [programAuthority] = anchor.web3.PublicKey.findProgramAddressSync(
//             [Buffer.from("program_authority")],
//             program.programId
//         );
//         console.log("Program authority: ", programAuthority.toBase58());

//         [programState] = anchor.web3.PublicKey.findProgramAddressSync(
//             [Buffer.from("program_state")],
//             program.programId
//         );
//         console.log("Program state: ", programState.toBase58()); // Log program state
//         // Initialize program with 2% fee
//         await program.methods
//             .initialize(new anchor.BN(100), user.publicKey)
//             .accounts({
//                 programState,
//                 owner: user.publicKey,
//                 systemProgram: anchor.web3.SystemProgram.programId,
//             })
//             .signers([user])
//             .rpc();
//         console.log("Program initialized");

//         [feePool] = anchor.web3.PublicKey.findProgramAddressSync(
//             [Buffer.from("program_state"), Buffer.from("fee_pool")],
//             program.programId
//         );
//         const feePoolMint = mint; // Or whatever mint your fee pool uses

//         feePoolTokenAccount = await getAssociatedTokenAddress( // Define feePoolTokenAccount here in beforeEach
//             mint,
//             feePool,
//             true // Allow owner/delegate of FeePool PDA to be authority
//         );

//         await program.methods.initializeFeePool().accounts({
//             feePool,
//             authority: user.publicKey,
//             programState,
//             tokenMint: feePoolMint,
//             tokenProgram: TOKEN_PROGRAM_ID,
//             systemProgram: anchor.web3.SystemProgram.programId,
//             rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//         }).signers([user]).rpc();
//         // Create event
//         eventId = 0;
//         const eventIdBuffer = Buffer.from(new Array(8).fill(0));
//         eventIdBuffer.writeUInt32LE(eventId, 0);
//         console.log("Event ID: ", eventId);
//         [event] = anchor.web3.PublicKey.findProgramAddressSync(
//             [Buffer.from("event"), eventIdBuffer],
//             program.programId
//         );

//         const startTime = Math.floor(Date.now() / 1000);
//         const deadline = startTime + 3600; // 1 hour from now
//         const now = Math.floor(Date.now() / 1000);
//         await program.methods
//             .createEvent(
//                 "Test Event",
//                 new anchor.BN(now + 1), // Start time just slightly in future
//                 new anchor.BN(now + 2),
//                 ["outcome1", "outcome2"],
//                 new anchor.BN(0)
//             )
//             .accounts({
//                 programState,
//                 event,
//                 owner: user.publicKey,
//                 systemProgram: anchor.web3.SystemProgram.programId,
//             })
//             .signers([user])
//             .rpc();
//         console.log("Event created");

//         // Initialize event pool
//         let eventPoolBump; // Declare variable to store the bump
//         [eventPool, eventPoolBump] = anchor.web3.PublicKey.findProgramAddressSync( // Capture eventPoolBump
//             [Buffer.from("event"), eventIdBuffer, Buffer.from("pool")],
//             program.programId
//         );
//         console.log("Event Pool (Test): ", eventPool.toBase58());
//         console.log("Event Pool Bump (Test): ", eventPoolBump); // Log the bump seed

//         await program.methods
//             .initializeEventPool()
//             .accounts({
//                 event,
//                 eventPool,
//                 payer: user.publicKey,
//                 tokenMint: mint, // Use the correct mint for the event pool
//                 systemProgram: anchor.web3.SystemProgram.programId,
//                 tokenProgram: TOKEN_PROGRAM_ID,
//                 rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//             })
//             .signers([user])
//             .rpc();

//         // Initialize user bet
//         [userBet] = anchor.web3.PublicKey.findProgramAddressSync(
//             [Buffer.from("user_bet"), user.publicKey.toBuffer(), eventIdBuffer],
//             program.programId
//         );

//         await program.methods
//             .initializeUserBet()
//             .accounts({
//                 userBet,
//                 event,
//                 user: user.publicKey,
//                 systemProgram: anchor.web3.SystemProgram.programId,
//             })
//             .signers([user])
//             .rpc();

//         // Place bet
//         const betAmount = new anchor.BN(100000000); // 100 tokens
//         await program.methods
//             .placeBet("outcome1", betAmount)
//             .accounts({
//                 event,
//                 userBet,
//                 userTokenAccount,
//                 eventPool,
//                 user: user.publicKey,
//                 tokenProgram: TOKEN_PROGRAM_ID,
//             })
//             .signers([user])
//             .rpc();
//         console.log("Bet placed");
//         // Fast forward time
//         await provider.connection.confirmTransaction(
//             await provider.connection.requestAirdrop(user.publicKey, anchor.web3.LAMPORTS_PER_SOL)
//         );
//         await new Promise(resolve => setTimeout(resolve, 3000));
//         // Log accounts before resolveEvent
//         console.log("Event Pool (Test): ", eventPool.toBase58()); // Log in test before resolveEvent
//         console.log("Fee Pool (Test): ", feePool.toBase58());   // Log in test before resolveEvent
//         console.log("Event Account (Test): ", event.toBase58());  // Log in test before resolveEvent

//         // Get Event Pool balance before resolve
//         const eventPoolAccountBefore = await getAccount(provider.connection, eventPool);
//         const feePoolAccountBefore = await getAccount(provider.connection, feePool);
//         const initialEventPoolBalance = new anchor.BN(eventPoolAccountBefore.amount.toString()); // Convert bigint to anchor.BN
//         const initialFeePoolBalance = new anchor.BN(feePoolAccountBefore.amount.toString()); // Convert bigint to anchor.BN

//         console.log("typeof initialEventPoolBalance (after conversion):", typeof initialEventPoolBalance); // Log type AFTER conversion
//         console.log("initialEventPoolBalance (after conversion):", initialEventPoolBalance); // Log value AFTER conversion

//         console.log("eventPoolAccountBefore:", eventPoolAccountBefore); // Log the entire account object
//         console.log("initialEventPoolBalance (before muln):", initialEventPoolBalance); // Log the amount value
//         console.log("typeof initialEventPoolBalance:", typeof initialEventPoolBalance); // Log the type
//         // Resolve event
//         await program.methods
//             .resolveEvent("outcome1")
//             .accounts({
//                 programState,
//                 event,
//                 owner: user.publicKey,
//                 eventPool, // Ensure eventPool is passed to resolveEvent
//                 feePool,  // Ensure feePool is passed to resolveEvent
//                 tokenProgram: TOKEN_PROGRAM_ID,
//                 systemProgram: SystemProgram.programId,
//             })
//             .signers([user])
//             .rpc();
//         console.log("Event resolved");

//         const fetchedProgramState = await program.account.programState.fetch(programState);
//         const feePercentage = fetchedProgramState.feePercentage.toNumber();
//         const expectedFee = initialEventPoolBalance.muln(feePercentage).divn(10000);

//         // Get Event Pool and Fee Pool balances after resolve
//         const eventPoolAccountAfter = await getAccount(provider.connection, eventPool);
//         const feePoolAccountAfter = await getAccount(provider.connection, feePool);
//         const finalEventPoolBalance = eventPoolAccountAfter.amount;
//         const finalFeePoolBalance = feePoolAccountAfter.amount;

//         // Assert that fee has been transferred (Simplified Assertion)
//         console.log("Expected Event Pool Balance:", initialEventPoolBalance.sub(expectedFee).toString());
//         console.log("Final Event Pool Balance:", finalEventPoolBalance.toString());
//         console.log("Expected Fee Pool Balance:", initialFeePoolBalance.add(expectedFee).toString());
//         console.log("Final Fee Pool Balance:", finalFeePoolBalance.toString());

//         assert.isTrue(finalEventPoolBalance.toString() === initialEventPoolBalance.sub(expectedFee).toString(), "Event Pool balance should decrease by fee (String Compare)"); // Simplified assertion - String compare
//         assert.isTrue(finalFeePoolBalance.toString() === initialFeePoolBalance.add(expectedFee).toString(), "Fee Pool balance should increase by fee (String Compare)");   // Simplified assertion - String compare

//         // Assert event is resolved and winning outcome is set
//         const fetchedEvent = await program.account.event.fetch(event);
//         assert.isTrue(fetchedEvent.resolved, "Event should be resolved");
//         assert.isNotNull(fetchedEvent.winningOutcome, "Winning outcome should not be null"); // Check if it's not null (i.e., Some)
//         assert.equal(fetchedEvent.winningOutcome, "outcome1", "Winning outcome should be 'outcome1'"); // Directly compare
//     });

//     it("should withdraw fees successfully", async () => {
        

//         await program.methods
//             .withdrawFees(WITHDRAW_AMOUNT)
//             .accounts({
//                 programState,
//                 feePool: feePool, 
//                 owner: user.publicKey,
//                 programAuthority,
//                 tokenProgram: TOKEN_PROGRAM_ID,
//                 systemProgram: SystemProgram.programId,
//                 rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//                 clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
//                 ownerTokenAccount: userTokenAccount,
//                 feePoolTokenAccount: feePoolTokenAccount, 
//             })
//             .signers([user])
//             .rpc();

            
//     });

//     it("should claimwinning successfully", async () => {
//         await program.methods
//             .claimWinnings()
//             .accounts({
//                 event,
//                 userBet,
//                 userTokenAccount,
//                 eventPool,
//                 user: user.publicKey,
//                 tokenProgram: TOKEN_PROGRAM_ID,
//             })
//             .signers([user])
//             .rpc();
//         console.log("Claim Winnings instruction called");
//     });
// });