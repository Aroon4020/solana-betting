// import * as anchor from "@coral-xyz/anchor";
// import { Program } from "@coral-xyz/anchor";
// import { EventBetting } from "../target/types/event_betting";
// import { assert } from "chai";
// import {
//     createMint,
//     createAccount,
//     mintTo,
//     TOKEN_PROGRAM_ID,
//     getAccount as getTokenAccount,
//     getAssociatedTokenAddress,
//     createAssociatedTokenAccountInstruction,
// } from "@solana/spl-token";
// //import * as nacl from 'tweetnacl';
// //import { PublicKey, SystemProgram, Transaction, Keypair, Connection, Provider } from "@solana/web3.js";
// import {
//     generateKeyPair,
//     signBytes,
//     verifySignature,
//     getUtf8Encoder,
//     getBase58Decoder, PublicKey, SystemProgram, Transaction, Keypair, Connection, Provider, SYSVAR_RENT_PUBKEY
// } from "@solana/web3.js";
// import { ethers } from "ethers";

// describe("event-betting extended tests: resolve_event, claim_winnings, withdraw_fees", () => {
//     // Configure the client to use the local cluster.
//     anchor.setProvider(anchor.AnchorProvider.env());
//     //provider.payer = owner;
//     const program = anchor.workspace.EventBetting as Program<EventBetting>;
//     const provider = anchor.getProvider() as anchor.AnchorProvider;
//     const connection = provider.connection;

//     // Accounts - Reused and some new ones
//     let owner: Keypair;
//     let user: Keypair;
//     let user2: Keypair; // For multiple users betting
//     let programAuthority: Keypair;
//     let eventAuthority: Keypair;

//     let programStatePDA: PublicKey;
//     let eventPDA: PublicKey;
//     let eventPoolPDA: PublicKey;
//     let feePoolPDA: PublicKey;
//     let programAuthorityPDAAccount: PublicKey;

//     let tokenMint: PublicKey;
//     let ownerTokenAccount: PublicKey;
//     let feePoolTokenAccount: PublicKey;
//     let eventPoolTokenAccount: PublicKey;
//     let userTokenAccount: PublicKey;
//     let user2TokenAccount: PublicKey;
//     let userBetPDA: PublicKey;
//     let user2BetPDA: PublicKey;
//     let userAccountPDA: PublicKey; // User PDA account
//     let user2AccountPDA: PublicKey; // User2 PDA account
//     //provider.payer = owner;

//     const feePercentage = new anchor.BN(1000); // 2%
//     const eventDescription = "Test Event Description for Resolve/Claim/Withdraw";
//     const startTime = Math.floor(Date.now() / 1000) + 5; // Event starts in 5 seconds
//     const deadline = Math.floor(Date.now() / 1000) + 8;
//     const possibleOutcomes = ["Outcome 1", "Outcome 2"];
//     const voucherAmount = new anchor.BN(10000);
//     const winningOutcome = "Outcome 1";
//     const betAmount = new anchor.BN(100000); // Bet amount for placing bets

//     before(async () => {
//         owner = Keypair.generate();
//         user = Keypair.generate();
//         user2 = Keypair.generate(); // Generate user2 keypair
//         programAuthority = Keypair.generate();
//         console.log("Type of programAuthority in before hook:", typeof programAuthority.sign); // ADD THIS LINE
//         eventAuthority = Keypair.generate();

//         // Airdrop SOL to owner and users - INCREASED AMOUNT

//         await Promise.all([
//             connection.requestAirdrop(owner.publicKey, 100 * anchor.web3.LAMPORTS_PER_SOL),
//             connection.requestAirdrop(user.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL), // Airdrop to user
//             connection.requestAirdrop(user2.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL), // Airdrop to user2
//             connection.requestAirdrop(provider.wallet.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
//         ]).then(signatures => Promise.all(signatures.map(sig => provider.connection.confirmTransaction(sig))));


//         // **IMMEDIATE BALANCE CHECK AFTER AIRDROP - for all keypairs
//         let ownerBalanceAfterAirdrop = await connection.getBalance(owner.publicKey);
//         let userBalanceAfterAirdrop = await connection.getBalance(user.publicKey);
//         let user2BalanceAfterAirdrop = await connection.getBalance(user2.publicKey);



//         // Derive PDAs
//         const [_programStatePDA, _programStateBump] = await PublicKey.findProgramAddress(
//             [Buffer.from(anchor.utils.bytes.utf8.encode("program_state"))],
//             program.programId
//         );
//         programStatePDA = _programStatePDA;

//         const [_programAuthorityPDAAccount, _programAuthorityBump] = await PublicKey.findProgramAddress(
//             [Buffer.from(anchor.utils.bytes.utf8.encode("program_authority"))],
//             program.programId
//         );
//         programAuthorityPDAAccount = _programAuthorityPDAAccount;


//         tokenMint = await createMint(
//             connection,
//             owner,
//             owner.publicKey,
//             null,
//             9,
//         );


//         ownerTokenAccount = await getAssociatedTokenAddress(
//             tokenMint,
//             owner.publicKey,
//         );

//         feePoolPDA = await PublicKey.findProgramAddress( // Use findProgramAddress
//             [Buffer.from(anchor.utils.bytes.utf8.encode("program_state")), Buffer.from(anchor.utils.bytes.utf8.encode("fee_pool"))],
//             program.programId
//         );
//         console.log("Fee Pool PDA:", feePoolPDA[0].toBase58());
//         feePoolTokenAccount = await getAssociatedTokenAddress(
//             tokenMint,
//             feePoolPDA[0], // Access the PublicKey from the result of findProgramAddress
//             true
//         );
//         // Event Pool PDA - Event ID 0 for setup
//         eventPoolPDA = await PublicKey.findProgramAddress(
//             [Buffer.from(anchor.utils.bytes.utf8.encode("event")), new anchor.BN(0).toArrayLike(Buffer, "le", 8), Buffer.from(anchor.utils.bytes.utf8.encode("pool"))],
//             program.programId
//         );

//         // Correct: Event Pool Token Account is now just the Event Pool PDA itself
//         eventPoolTokenAccount = eventPoolPDA[0]; // <---- Corrected: Use eventPoolPDA[0] directly
//         console.log("Event Pool Token Account (now PDA):", eventPoolTokenAccount.toBase58());


//         userTokenAccount = await getAssociatedTokenAddress(
//             tokenMint,
//             user.publicKey,
//         );

//         user2TokenAccount = await getAssociatedTokenAddress(
//             tokenMint,
//             user2.publicKey,
//         );


//         // User Account PDA
//         const [_userAccountPDA, _userAccountBump] = await PublicKey.findProgramAddress(
//             [Buffer.from(anchor.utils.bytes.utf8.encode("user")), user.publicKey.toBytes()],
//             program.programId
//         );

//         userAccountPDA = _userAccountPDA;
//         const [_user2AccountPDA, _user2AccountBump] = await PublicKey.findProgramAddress(
//             [Buffer.from(anchor.utils.bytes.utf8.encode("user")), user2.publicKey.toBytes()],
//             program.programId
//         );
//         user2AccountPDA = _user2AccountPDA;


//         // User Bet PDAs (need event ID later, using 0 for setup)
//         const [_userBetPDAA, _userBetBump] = await PublicKey.findProgramAddress(
//             [Buffer.from(anchor.utils.bytes.utf8.encode("user_bet")), user.publicKey.toBytes(), new anchor.BN(0).toArrayLike(Buffer, "le", 8)],
//             program.programId
//         );
//         userBetPDA = _userBetPDAA;

//         const [_user2BetPDAA, _user2BetBumpA] = await PublicKey.findProgramAddress(
//             [Buffer.from(anchor.utils.bytes.utf8.encode("user_bet")), user2.publicKey.toBytes(), new anchor.BN(0).toArrayLike(Buffer, "le", 8)],
//             program.programId
//         );
//         user2BetPDA = _user2BetPDAA;



//         // Create Associated Token Accounts if they don't exist
//         async function createATAIfNotExist(ataPublicKey, mint, ownerPublicKey, payerKeypair) {
//             try {
//                 await getTokenAccount(connection, ataPublicKey);
//             } catch (error) {

//                 const createAtaIx = createAssociatedTokenAccountInstruction(
//                     payerKeypair.publicKey,
//                     ataPublicKey,
//                     ownerPublicKey,
//                     mint,
//                     TOKEN_PROGRAM_ID,
//                     anchor.web3.TOKEN_2022_PROGRAM_ID
//                 );
//                 const tx = new Transaction().add(createAtaIx);

//                 try {
//                     const txSig = await anchor.web3.sendAndConfirmTransaction( // <---- Capture txSig
//                         connection,
//                         tx,
//                         [payerKeypair],
//                         { commitment: "confirmed" }
//                     );
//                     const ataAccount = await getTokenAccount(connection, ataPublicKey);

//                 } catch (sendError) {
//                     console.error("Error creating ATA:", ataPublicKey.toBase58());
//                     console.error(sendError);
//                 }
//             }
//         }

//         await createATAIfNotExist(feePoolTokenAccount, tokenMint, feePoolPDA[0], owner); // payer=owner
//         //await createATAIfNotExist(eventPoolTokenAccount, tokenMint, eventPoolPDA[0], owner); // Removed - eventPoolTokenAccount is not ATA anymore
//         await createATAIfNotExist(ownerTokenAccount, tokenMint, owner.publicKey, owner); // payer=owner
//         await createATAIfNotExist(userTokenAccount, tokenMint, user.publicKey, owner); // payer=owner
//         await createATAIfNotExist(user2TokenAccount, tokenMint, user2.publicKey, owner); // payer=owner


//         // Mint tokens to owner and user accounts
//         await mintTo(connection, owner, tokenMint, ownerTokenAccount, owner, 1000000000);
//         await mintTo(connection, owner, tokenMint, userTokenAccount, owner, 10000000000); // Mint to user
//         await mintTo(connection, owner, tokenMint, user2TokenAccount, owner, 10000000000); // Mint to user2

//         await program.methods.initialize(feePercentage, programAuthority.publicKey)
//             .accounts({
//                 programAuthority: programAuthorityPDAAccount,
//                 programState: programStatePDA,
//                 owner: owner.publicKey,
//                 systemProgram: SystemProgram.programId,
//                 rent: SYSVAR_RENT_PUBKEY,
//             })
//             .signers([owner])
//             .rpc();

//         await program.methods.initializeFeePool()
//             .accounts({
//                 feePool: feePoolPDA[0],
//                 authority: owner.publicKey,
//                 programState: programStatePDA,
//                 programAuthority: programAuthorityPDAAccount,
//                 tokenMint: tokenMint,
//                 tokenProgram: TOKEN_PROGRAM_ID,
//                 systemProgram: SystemProgram.programId,
//                 rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//             })
//             .signers([owner])
//             .rpc();

//         let nextEventId = (await program.account.programState.fetch(programStatePDA)).nextEventId;
//         let [_eventPDA, _eventBump] = await PublicKey.findProgramAddress(
//             [Buffer.from(anchor.utils.bytes.utf8.encode("event")), nextEventId.toArrayLike(Buffer, "le", 8)],
//             program.programId
//         );
//         eventPDA = _eventPDA;
//         let now = Math.floor(Date.now() / 1000);
//         await program.methods.createEvent(eventDescription, new anchor.BN(now + 1), new anchor.BN(now + 4), possibleOutcomes, new anchor.BN(0))
//             .accounts({
//                 programState: programStatePDA,
//                 event: eventPDA,
//                 owner: owner.publicKey,
//                 systemProgram: SystemProgram.programId,
//             })
//             .signers([owner])
//             .rpc();

//         // In the 'before' hook after creating the event:
//         let programStateAfterCreate = await program.account.programState.fetch(programStatePDA);
//         let actualEventId = programStateAfterCreate.nextEventId - 1; // Since nextEventId was incremented

//         // Derive event PDA with correct ID by assigning to the existing variable
//         [eventPDA] = await PublicKey.findProgramAddress(
//             [Buffer.from("event"), new anchor.BN(actualEventId).toArrayLike(Buffer, "le", 8)],
//             program.programId
//         );

//         // Derive event pool PDA with correct event ID by assigning to the existing variable
//         [eventPoolPDA] = await PublicKey.findProgramAddress(
//             [
//                 Buffer.from("event"),
//                 new anchor.BN(actualEventId).toArrayLike(Buffer, "le", 8),
//                 Buffer.from("pool")
//             ],
//             program.programId
//         );
//         eventPoolTokenAccount = eventPoolPDA; // <---- Corrected: Use eventPoolPDA[0] directly


//         let initEventPoolTx = await program.methods.initializeEventPool()
//             .accounts({
//                 event: eventPDA,
//                 eventPool: eventPoolPDA[0], // <---- Corrected: Use eventPoolPDA[0]
//                 eventPoolTokenAccount: eventPoolTokenAccount, // <---- Corrected: Use eventPoolTokenAccount (which is now eventPoolPDA[0])
//                 payer: owner.publicKey, // Owner pays for Event Pool account
//                 tokenMint: tokenMint,
//                 systemProgram: SystemProgram.programId,
//                 tokenProgram: TOKEN_PROGRAM_ID,
//                 rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//             })
//             .signers([owner])
//             .rpc();
//         await connection.confirmTransaction(initEventPoolTx);

//         const eventPoolAccountInfoCheck = await connection.getAccountInfo(eventPoolTokenAccount);
//         const event_account = await program.account.event.fetch(eventPDA);

//         const USER_BET_SEED = Buffer.from(anchor.utils.bytes.utf8.encode("user_bet")); // Define USER_BET_SEED here or at top of file if not already
//         const userBetSeedBuffer = USER_BET_SEED; // Use the defined USER_BET_SEED
//         const userBetPublicKeyBytes = user.publicKey.toBytes();
//         const eventIdBuffer = new anchor.BN(event_account.id).toArrayLike(Buffer, 'le', 8); // Get event.id from fetched account
//         const [_userBetPDA, _userBetBumpA] = await PublicKey.findProgramAddress(
//             [userBetSeedBuffer, userBetPublicKeyBytes, eventIdBuffer],
//             program.programId
//         );
//         userBetPDA = _userBetPDA;

//         await program.methods.initializeUserBet()
//             .accounts({
//                 userBet: userBetPDA,
//                 event: eventPDA,
//                 user: user.publicKey,
//                 systemProgram: SystemProgram.programId,
//             })
//             .signers([user]) // User is the payer and signer for user_bet init
//             .rpc();

//         const user2BetSeedBuffer = USER_BET_SEED; // Use the defined USER_BET_SEED
//         const user2BetPublicKeyBytes = user2.publicKey.toBytes();
//         const eventIdBuffer_user2 = new anchor.BN(event_account.id).toArrayLike(Buffer, 'le', 8); // Get event.id from fetched account
//         const [_user2BetPDA, _user2BetBump] = await PublicKey.findProgramAddress(
//             [user2BetSeedBuffer, user2BetPublicKeyBytes, eventIdBuffer_user2],
//             program.programId
//         );
//         user2BetPDA = _user2BetPDA;

//         await program.methods.initializeUserBet()
//             .accounts({
//                 userBet: user2BetPDA,
//                 event: eventPDA,
//                 user: user2.publicKey, // Use user2's public key here
//                 systemProgram: SystemProgram.programId,
//             })
//             .signers([user2]) // user2 is payer and signer for user2_bet init
//             .rpc();

//         // Update UserBet PDAs with correct event ID
//         const [_userBetPDA_updated, _userBetBump_updated] = await PublicKey.findProgramAddress(
//             [Buffer.from(anchor.utils.bytes.utf8.encode("user_bet")), user.publicKey.toBytes(), nextEventId.toArrayLike(Buffer, "le", 8)],
//             program.programId
//         );
//         userBetPDA = _userBetPDA_updated;
//         const [_user2BetPDA_updated, _user2BetBump_updated] = await PublicKey.findProgramAddress(
//             [Buffer.from(anchor.utils.bytes.utf8.encode("user_bet")), user2.publicKey.toBytes(), nextEventId.toArrayLike(Buffer, "le", 8)],
//             program.programId
//         );
//         user2BetPDA = _user2BetPDA_updated;
//         //console.log("EventPoolTokenAccount at the END of before hook:", eventPoolPDA[0].toBase58());
//     });

//     it("Should resolve the event and transfer fees", async () => {
//         // Place bets from users *before* resolving
//         console.log("Placing bets from users before resolving event...");
//         await program.methods.placeBet(possibleOutcomes[0], betAmount)
//             .accounts({
//                 event: eventPDA,
//                 userBet: userBetPDA,
//                 userTokenAccount: userTokenAccount,
//                 eventPool: eventPoolTokenAccount,
//                 user: user.publicKey,
//                 tokenProgram: TOKEN_PROGRAM_ID,
//             })
//             .signers([user])
//             .rpc();

//         await program.methods.placeBet(possibleOutcomes[1], betAmount) // User2 bets on Outcome 2
//             .accounts({
//                 event: eventPDA,
//                 userBet: user2BetPDA,
//                 userTokenAccount: user2TokenAccount,
//                 eventPool: eventPoolTokenAccount,
//                 user: user2.publicKey,
//                 tokenProgram: TOKEN_PROGRAM_ID,
//             })
//             .signers([user2])
//             .rpc();
//         await program.methods.placeBet(possibleOutcomes[0], betAmount) // User2 bets on Outcome 2
//             .accounts({
//                 event: eventPDA,
//                 userBet: userBetPDA,
//                 userTokenAccount: userTokenAccount,
//                 eventPool: eventPoolTokenAccount,
//                 user: user.publicKey,
//                 tokenProgram: TOKEN_PROGRAM_ID,
//             })
//             .signers([user])
//             .rpc();
//         console.log("Bets placed successfully!");
//         let currentTime = Math.floor(Date.now() / 1000);
//         if (deadline > currentTime) {
//             const waitTime = deadline - currentTime;
//             console.log(`Waiting for ${waitTime} seconds (deadline - current) for deadline to pass...`);
//             await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
//             console.log("Deadline passed, proceeding to resolve event.");
//         } else {
//             console.log("Deadline already passed, proceeding to resolve event immediately.");
//         }

//         console.log("Fee Pool PDA[0] (before rederive):", feePoolPDA[0].toBase58()); // <---- ADDED LOGGING
//         feePoolTokenAccount = await getAssociatedTokenAddress(
//             tokenMint,
//             feePoolPDA[0],
//             true
//         );
//         console.log("Fee Pool Token Account (before resolveEvent):", feePoolTokenAccount.toBase58());


//         await new Promise(resolve => setTimeout(resolve, 3000));
//         await program.methods.resolveEvent(winningOutcome)
//             .accounts({
//                 programState: programStatePDA,
//                 event: eventPDA,
//                 programAuthority: programAuthorityPDAAccount, // Correct PDA
//                 eventPool: eventPoolTokenAccount,
//                 feePoolTokenAccount: feePoolPDA[0], // <---- Corrected: Use feePoolPDA[0]
//                 tokenMint: tokenMint,
//                 tokenProgram: TOKEN_PROGRAM_ID,
//                 owner: owner.publicKey,
//             })
//             .signers([owner])
//             .rpc();
//         console.log("Event Resolved.", eventPoolTokenAccount);
//         let eventPoolBalanceAfterResolve = await getTokenAccount(connection, eventPoolTokenAccount);
//         console.log(`Event Pool Balance after event resolved: ${eventPoolBalanceAfterResolve.amount.toString()}`);

//         const resolvedEvent = await program.account.event.fetch(eventPDA);
//         console.log("Resolved Event:", resolvedEvent);
//         assert.ok(resolvedEvent.resolved);
//         assert.strictEqual(resolvedEvent.winningOutcome, winningOutcome, "Winning outcome should be set"); // Removed .unwrap()
//     });

//     it("Should withdraw fees successfully", async () => {
//         // 1. Fetch initial balances and program state
//         const initialFeePoolTokenAccountBalance = await getTokenAccount(connection, feePoolTokenAccount);
//         const initialOwnerTokenAccountBalance = await getTokenAccount(connection, ownerTokenAccount);
//         const initialProgramState = await program.account.programState.fetch(programStatePDA); // <---- FETCH PROGRAM STATE
//         const initialAccumulatedFees = initialProgramState.accumulatedFees;

//         console.log("Initial Fee Pool Token Account Balance:", initialFeePoolTokenAccountBalance.amount.toString());
//         console.log("Initial Owner Token Account Balance:", initialOwnerTokenAccountBalance.amount.toString());
//         console.log("Initial Accumulated Fees:", initialAccumulatedFees.toString());

//         // 2. Call withdrawFees instruction
//         console.log("Calling withdrawFees instruction...");
//         await program.methods.withdrawFees(new anchor.BN(4000))
//             .accounts({
//                 programState: programStatePDA, // <---- ADD PROGRAM STATE ACCOUNT HERE
//                 programAuthority: programAuthorityPDAAccount,
//                 feePool: feePoolPDA[0], // Or feePoolTokenAccount - using feePoolPDA[0] for consistency with resolveEvent
//                 feePoolTokenAccount: feePoolTokenAccount, // Redundant, but keeping for now - should be same as feePool
//                 ownerTokenAccount: ownerTokenAccount,
//                 owner: owner.publicKey,
//                 tokenProgram: TOKEN_PROGRAM_ID,
//             })
//             .signers([owner])
//             .rpc();

//         console.log("withdrawFees instruction executed.");

//         // 3. Fetch updated balances and program state
//         const updatedFeePoolTokenAccountBalance = await getTokenAccount(connection, feePoolTokenAccount);
//         const updatedOwnerTokenAccountBalance = await getTokenAccount(connection, ownerTokenAccount);
//         const updatedProgramState = await program.account.programState.fetch(programStatePDA); // <---- FETCH PROGRAM STATE AGAIN
//         const updatedAccumulatedFees = updatedProgramState.accumulatedFees;

//         console.log("Updated Fee Pool Token Account Balance:", updatedFeePoolTokenAccountBalance.amount.toString());
//         console.log("Updated Owner Token Account Balance:", updatedOwnerTokenAccountBalance.amount.toString());
//         console.log("Updated Accumulated Fees:", updatedAccumulatedFees.toString());
//     });

//     it("Should claim winnings successfully", async () => {
//         // Fetch initial balances before claim
//         const initialUserTokenAccountBalance = await getTokenAccount(connection, userTokenAccount);
//         const initialEventPoolTokenAccountBalance = await getTokenAccount(connection, eventPoolTokenAccount);
//         const initialUserBet = await program.account.userBet.fetch(userBetPDA);

//         console.log("Initial User Token Account Balance:", initialUserTokenAccountBalance.amount.toString());
//         console.log("Initial Event Pool Token Account Balance:", initialEventPoolTokenAccountBalance.amount.toString());
//         console.log("Initial User Bet Amount:", initialUserBet.amount.toString());

//         // Ensure userBet.amount > 0 and event is resolved (pre-conditions for claim_winnings)
//         assert.ok(initialUserBet.amount.gtn(0), "Initial user bet amount should be greater than 0");
//         const eventAccount = await program.account.event.fetch(eventPDA);
//         assert.ok(eventAccount.resolved, "Event should be resolved before claiming winnings");
//         //        
//         // Call claimWinnings instruction
//         console.log("Calling claimWinnings instruction...");
//         await program.methods.claimWinnings()
//             .accounts({
//                 event: eventPDA,
//                 userBet: userBetPDA,
//                 userTokenAccount: userTokenAccount,
//                 eventPool: eventPoolTokenAccount,
//                 user: user.publicKey,
//                 tokenProgram: TOKEN_PROGRAM_ID,
//             })
//             .signers([user])
//             .rpc();

//         console.log("claimWinnings instruction executed.");

//         // Fetch updated balances after claim
//         const updatedUserTokenAccountBalance = await getTokenAccount(connection, userTokenAccount);
//         const updatedEventPoolTokenAccountBalance = await getTokenAccount(connection, eventPoolTokenAccount);
//         const updatedUserBet = await program.account.userBet.fetch(userBetPDA);

//         console.log("Updated User Token Account Balance:", updatedUserTokenAccountBalance.amount.toString());
//         console.log("Updated Event Pool Token Account Balance:", updatedEventPoolTokenAccountBalance.amount.toString());
//         console.log("Updated User Bet Amount:", updatedUserBet.amount.toString());
//     });

//     it("Should update voucher amount for an event", async () => {
//         // 1. Add voucher funds to program state
//         const additionalVoucherFunds = new anchor.BN(50000);
//         await program.methods.addVoucherFunds(additionalVoucherFunds)
//             .accounts({
//                 programState: programStatePDA,
//                 feePoolTokenAccount: feePoolTokenAccount,
//                 userTokenAccount: ownerTokenAccount, // Corrected: userTokenAccount is needed, using ownerTokenAccount as fund source
//                 fundSource: owner.publicKey,        // Corrected: fundSource is the signer
//                 tokenProgram: TOKEN_PROGRAM_ID,
//             })
//             .signers([owner])                        // Corrected: owner is the signer
//             .rpc();
//         console.log("Voucher funds added.");
//         // 2. Create a new event with a specific voucher amount
//         let nextEventId = (await program.account.programState.fetch(programStatePDA)).nextEventId;
//         let [_newEventPDA, _eventBump] = await PublicKey.findProgramAddress(
//             [Buffer.from(anchor.utils.bytes.utf8.encode("event")), nextEventId.toArrayLike(Buffer, "le", 8)],
//             program.programId
//         );
//         const newEventPDA = _newEventPDA;
//         let now = Math.floor(Date.now() / 1000);
//         const newEventVoucherAmount = new anchor.BN(25000);

//         await program.methods.createEvent(eventDescription, new anchor.BN(now + 1), new anchor.BN(now + 4), possibleOutcomes, newEventVoucherAmount)
//             .accounts({
//                 programState: programStatePDA,
//                 event: newEventPDA, // Use newEventPDA for the new event
//                 owner: owner.publicKey,
//                 systemProgram: SystemProgram.programId,
//             })
//             .signers([owner])
//             .rpc();
//         console.log("New event created with voucher amount.");
//         // 3. Update voucher amount for the newly created event
//         const updatedVoucherAmount = new anchor.BN(5000);
//         await program.methods.updateVoucherAmount(updatedVoucherAmount)
//             .accounts({
//                 programState: programStatePDA,
//                 event: newEventPDA, // Use newEventPDA to update the new event
//                 owner: owner.publicKey,
//             })
//             .signers([owner])
//             .rpc();
//         console.log("voucher amount Added");
//         // 4. Assert that the voucher amount is updated correctly
//         const fetchedUpdatedEvent = await program.account.event.fetch(newEventPDA); // Fetch the new event
//         assert.ok(fetchedUpdatedEvent.voucherAmount.eq(updatedVoucherAmount), "Voucher amount should be updated for the new event");
//     });

//     it("Should revoke an event", async () => {
//         let nextEventId = (await program.account.programState.fetch(programStatePDA)).nextEventId;
//         let [_newEventPDA, _eventBump] = await PublicKey.findProgramAddress(
//             [Buffer.from(anchor.utils.bytes.utf8.encode("event")), nextEventId.toArrayLike(Buffer, "le", 8)],
//             program.programId
//         );
//         const newEventPDA = _newEventPDA;
//         let now = Math.floor(Date.now() / 1000);
//         const newEventVoucherAmount = new anchor.BN(25000);

//         await program.methods.createEvent(eventDescription, new anchor.BN(Math.floor((Date.now() / 1000) + 3600)),
//             new anchor.BN(Math.floor(Date.now() / 1000) + 7200), possibleOutcomes, new anchor.BN(0))
//             .accounts({
//                 programState: programStatePDA,
//                 event: newEventPDA, // Use newEventPDA for the new event
//                 owner: owner.publicKey,
//                 systemProgram: SystemProgram.programId,
//             })
//             .signers([owner])
//             .rpc();
//         await program.methods.revokeEvent()
//             .accounts({
//                 programState: programStatePDA,
//                 event: eventPDA,
//                 owner: owner.publicKey,
//             })
//             .signers([owner])
//             .rpc();

//         //         const revokedEvent = await program.account.event.fetch(eventPDA);
//         //         assert.ok(revokedEvent.revoked);
//         //         assert.ok(revokedEvent.voucherAmount.eq(new anchor.BN(0))); // Voucher amount should be reset to 0 on revoke
//     });



//     it("Should increase deadline for an event", async () => {
//         const currentEvent = await program.account.event.fetch(eventPDA);
//         const originalDeadline = currentEvent.deadline;
//         const increasedDeadline = originalDeadline.add(new anchor.BN(3600)); // Increase deadline by 1 hour

//         await program.methods.increaseDeadline(increasedDeadline)
//             .accounts({
//                 programState: programStatePDA,
//                 event: eventPDA,
//                 owner: owner.publicKey,
//             })
//             .signers([owner])
//             .rpc();

//         const updatedEvent = await program.account.event.fetch(eventPDA);
//         assert.ok(updatedEvent.deadline.eq(increasedDeadline));
//     });

//     it("Should update fee percentage", async () => {
//         const newFeePercentage = new anchor.BN(500); // 5%
//         await program.methods.updateFeePercentage(newFeePercentage)
//             .accounts({
//                 programState: programStatePDA,
//                 programAuthority: programAuthorityPDAAccount,
//                 owner: owner.publicKey,
//             })
//             .signers([owner])
//             .rpc();

//         const updatedProgramState = await program.account.programState.fetch(programStatePDA);
//         assert.ok(updatedProgramState.feePercentage.eq(newFeePercentage));
//     });



//     it("Should update signer for program state", async () => {
//         const newProgramAuthoritySigner = Keypair.generate().publicKey;
//         await program.methods.updateSigner(newProgramAuthoritySigner)
//             .accounts({
//                 programState: programStatePDA,
//                 programAuthority: programAuthorityPDAAccount,
//                 owner: owner.publicKey,
//             })
//             .signers([owner])
//             .rpc();

//         //         const updatedProgramState = await program.account.programState.fetch(programStatePDA);
//         //         assert.ok(updatedProgramState.programAuthoritySigner.equals(newProgramAuthoritySigner));
//     });

//     it("Should update owner for program state", async () => {
//         const newOwner = Keypair.generate().publicKey;
//         await program.methods.updateOwner(newOwner)
//             .accounts({
//                 programState: programStatePDA,
//                 programAuthority: programAuthorityPDAAccount,
//                 owner: owner.publicKey,
//             })
//             .signers([owner])
//             .rpc();

//         const updatedProgramState = await program.account.programState.fetch(programStatePDA);
//         assert.ok(updatedProgramState.owner.equals(newOwner));
//     });

// });