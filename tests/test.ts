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
//     createInitializeAccountInstruction,
// } from "@solana/spl-token";
// import { SystemProgram } from "@solana/web3.js";

// describe("sequential_betting_actions", () => {
//     const provider = anchor.AnchorProvider.env();
//     anchor.setProvider(provider);
//     const program = anchor.workspace.EventBetting as Program<EventBetting>;
// console.log("Program ID:", program.programId.toBase58()); // <--- ADD THIS LINE

//     let mint: anchor.web3.PublicKey;
//     let eventId: number;
//     let event: anchor.web3.PublicKey;
//     let userTokenAccount: anchor.web3.PublicKey;
//     let eventPool: anchor.web3.PublicKey;
//     let userBet: anchor.web3.PublicKey;
//     let programState: anchor.web3.PublicKey;
//     let user: anchor.web3.Keypair;
//     let owner: anchor.web3.Keypair;
//     let programAuthority: anchor.web3.PublicKey;
//     let feePool: anchor.web3.PublicKey;
//     let feePoolTokenAccount: anchor.web3.PublicKey;
//     let ownerTokenAccount: anchor.web3.PublicKey;
//     const WITHDRAW_AMOUNT = new anchor.BN(500);
//     const BET_AMOUNT = new anchor.BN(100000000); // 100 tokens


//     before(async () => { // Use before() hook for ALL setup
//         owner = anchor.web3.Keypair.generate();
//         console.log("Owner public key (in 'before' hook): ", owner.publicKey.toBase58());
//         user = anchor.web3.Keypair.generate();
//         console.log("User public key (in 'before' hook): ", user.publicKey.toBase58());

//         // Airdrop SOL to Owner and User
//         await Promise.all([
//             provider.connection.requestAirdrop(owner.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
//             provider.connection.requestAirdrop(user.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL)
//         ]).then(signatures => Promise.all(signatures.map(sig => provider.connection.confirmTransaction(sig))));

//         // Program PDAs
//         [programAuthority] = anchor.web3.PublicKey.findProgramAddressSync(
//             [Buffer.from("program_authority")],
//             program.programId
//         );
//         [programState] = anchor.web3.PublicKey.findProgramAddressSync(
//             [Buffer.from("program_state")],
//             program.programId
//         );
//         [feePool] = anchor.web3.PublicKey.findProgramAddressSync(
//             [Buffer.from("program_state"), Buffer.from("fee_pool")],
//             program.programId
//         );


//         // Initialize program - Owner initializes ONCE in 'before'
//         await program.methods
//             .initialize(new anchor.BN(100), owner.publicKey)
//             .accounts({
//                 programState,
//                 owner: owner.publicKey,
//                 systemProgram: anchor.web3.SystemProgram.programId,
//             })
//             .signers([owner])
//             .rpc();
//         console.log("Program initialized (once in 'before' hook)");

//         // Create token mint - Owner is Minter, create ONCE in 'before'
//         mint = await createMint(
//             provider.connection,
//             owner,
//             owner.publicKey,
//             null,
//             6
//         );
//         console.log("Mint (created once in 'before' hook): ", mint.toBase58());

//         // Owner and User Token Accounts - DERIVE ADDRESSES
//         ownerTokenAccount = await getAssociatedTokenAddress(mint, owner.publicKey);
//         userTokenAccount = await getAssociatedTokenAddress(mint, user.publicKey);
//         feePoolTokenAccount = await getAssociatedTokenAddress(mint, feePool, true); // Derive Fee Pool ATA

//         console.log("Owner Token Account (derived in 'before' hook): ", ownerTokenAccount.toBase58());
//         console.log("User Token Account (derived in 'before' hook): ", userTokenAccount.toBase58());
//         console.log("Fee Pool Token Account (derived in 'before' hook): ", feePoolTokenAccount.toBase58());
        
//         try {
//             console.log("=== Debugging Fee Pool Token Account Initialization - Step 2 - Before sendAndConfirm ===");
//             const createAccountIx = anchor.web3.SystemProgram.createAccount({
//                 fromPubkey: owner.publicKey,
//                 newAccountPubkey: feePoolTokenAccount,
//                 space: 165,
//                 lamports: minRentExemption,
//                 programId: TOKEN_PROGRAM_ID,
//             });
//             const initializeAccountIx = createInitializeAccountInstruction({
//                 account: feePoolTokenAccount,
//                 mint: mint,
//                 owner: feePool,
//             }, TOKEN_PROGRAM_ID);

//             const tx = new anchor.web3.Transaction().add(createAccountIx, initializeAccountIx);

//             // ++++++++ Log Instructions and Accounts ++++++++
//             console.log("=== Debugging - Instructions in Transaction ===");
//             tx.instructions.forEach((ix, index) => {
//                 console.log(`--- Instruction ${index + 1} ---`);
//                 console.log("Program ID:", ix.programId.toBase58());
//                 console.log("Accounts:", ix.keys); // Log instruction accounts
//                 console.log("Data (length):", ix.data.length); // Log data length
//                 // Optionally, for specific instructions, try to decode data if you know the format
//             });
//             console.log("==========================================");
//             // ++++++++ End Log Instructions and Accounts ++++++++


//             console.log("=== Debugging Fee Pool Token Account Initialization - Step 3 - Transaction Created ===");
//             txSig = await provider.sendAndConfirm(tx, [owner]);
//             console.log("=== Debugging Fee Pool Token Account Initialization - Step 4 - After sendAndConfirm ===");
//             console.log("Fee Pool Token Account initialized (explicitly in test) - Tx Sig:", txSig);
//         } catch (error) {
//             console.error("Error during Fee Pool Token Account initialization:", error);
//         }
//         console.log("=== Debugging Fee Pool Token Account Initialization - Step 5 - After Try-Catch ==="); // Step 5 Log
//         // +++++++ EXPLICITLY CREATE Owner and Fee Pool ATAs ++++++++
//         await Promise.all([
//             provider.sendAndConfirm(new anchor.web3.Transaction().add(
//                 createAssociatedTokenAccountInstruction(owner.publicKey, ownerTokenAccount, owner.publicKey, mint) // Create Owner ATA
//             ), [owner]),
//             provider.sendAndConfirm(new anchor.web3.Transaction().add( // Create Fee Pool ATA - PAYER is Owner
//                 createAssociatedTokenAccountInstruction(owner.publicKey, feePoolTokenAccount, feePool, mint) // Fee Pool PDA as owner
//             ), [owner]), // Owner pays for Fee Pool ATA creation
//             provider.sendAndConfirm(new anchor.web3.Transaction().add(createAssociatedTokenAccountInstruction(user.publicKey, userTokenAccount, user.publicKey, mint)), [user]) // User ATA creation remains
//         ]);
//         console.log("Owner, Fee Pool, and User token accounts created");


//         // Mint tokens to user - Owner is Minter
//         await mintTo(provider.connection, owner, mint, userTokenAccount, owner.publicKey, 1000000000);
//         console.log("Tokens minted to user");


//          // Initialize fee pool - Owner initializes fee pool ONCE in 'before'
//          await program.methods.initializeFeePool().accounts({ // Simplified accounts
//             feePool, // Still pass feePool PDA address for consistency
//             authority: owner.publicKey,
//             programState,
//             programAuthority,
//             tokenMint: mint,
//             tokenProgram: TOKEN_PROGRAM_ID,
//             systemProgram: anchor.web3.SystemProgram.programId,
//             rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//         }).signers([owner]).rpc();
//         console.log("Fee Pool initialized (once in 'before' hook)");

//         // Create event - Owner creates event ONCE in 'before'
//         eventId = 0;
//         const eventIdBuffer = Buffer.from(new Array(8).fill(0));
//         eventIdBuffer.writeUInt32LE(eventId, 0);
//         event = anchor.web3.PublicKey.findProgramAddressSync(
//             [Buffer.from("event"), eventIdBuffer],
//             program.programId
//         )[0]; // Directly assign the PublicKey from array

//         const now = Math.floor(Date.now() / 1000);
//         await program.methods
//             .createEvent("Test Event", new anchor.BN(now + 1), new anchor.BN(now + 2), ["outcome1", "outcome2"], new anchor.BN(0))
//             .accounts({
//                 programState,
//                 event,
//                 owner: owner.publicKey,
//                 systemProgram: anchor.web3.SystemProgram.programId,
//             })
//             .signers([owner])
//             .rpc();
//         console.log("Event created");

//         // Initialize event pool - Owner initializes event pool ONCE in 'before'
//         eventPool = anchor.web3.PublicKey.findProgramAddressSync(
//             [Buffer.from("event"), eventIdBuffer, Buffer.from("pool")],
//             program.programId
//         )[0]; // Directly assign the PublicKey
//         await program.methods.initializeEventPool().accounts({
//             event,
//             eventPool,
//             payer: owner.publicKey,
//             tokenMint: mint,
//             systemProgram: anchor.web3.SystemProgram.programId,
//             tokenProgram: TOKEN_PROGRAM_ID,
//             rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//         }).signers([owner]).rpc();
//         console.log("Event Pool initialized");

//         // Initialize user bet - User initializes user bet ONCE in 'before'
//         userBet = anchor.web3.PublicKey.findProgramAddressSync(
//             [Buffer.from("user_bet"), user.publicKey.toBuffer(), eventIdBuffer],
//             program.programId
//         )[0]; // Directly assign
//         await program.methods.initializeUserBet().accounts({
//             userBet,
//             event,
//             user: user.publicKey,
//             systemProgram: anchor.web3.SystemProgram.programId,
//         }).signers([user]).rpc();
//         console.log("User Bet initialized");


//     });


//     it("should place bet successfully", async () => {
//         await program.methods
//             .placeBet("outcome1", BET_AMOUNT)
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
//             const eventPoolAccountAfterBet = await getAccount(provider.connection, eventPool);
//     const eventPoolBalanceAfterBet = new anchor.BN(eventPoolAccountAfterBet.amount.toString());
//     console.log("Event Pool Balance AFTER bet:", eventPoolBalanceAfterBet.toString());
//         // Optionally, verify bet was placed correctly (e.g., fetch userBet account)
//         const fetchedUserBet = await program.account.userBet.fetch(userBet);
//         assert.isTrue(fetchedUserBet.amount.eq(BET_AMOUNT), "Bet amount should be updated in userBet account");
//     });


//     it("should resolve event successfully", async () => {
//         // Fast forward time - simulate event ending after betting
//         await provider.connection.confirmTransaction(
//             await provider.connection.requestAirdrop(user.publicKey, anchor.web3.LAMPORTS_PER_SOL) // Airdrop to avoid possible rent issues during time increase
//         );
//         await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for clock to advance
    
//         const eventPoolAccountBeforeResolve = await getAccount(provider.connection, eventPool);
//         const feePoolAccountBeforeResolve = await getAccount(provider.connection, feePoolTokenAccount); // Get Fee Pool ATA balance
//         const initialEventPoolBalanceResolve = new anchor.BN(eventPoolAccountBeforeResolve.amount.toString());
//         const initialFeePoolTokenAccountBalanceResolve = new anchor.BN(feePoolAccountBeforeResolve.amount.toString());
    
//         // Log account keys *before* calling resolveEvent
//         console.log("=== Before resolveEvent ===");
//         console.log("Event Account Key (Test):", event.toBase58());
//         console.log("Event Pool Account Key (Test):", eventPool.toBase58());
//         console.log("Fee Pool Token Account Key (Test):", feePoolTokenAccount.toBase58()); // Correct
//         console.log("Program Authority Key (Test):", programAuthority.toBase58()); // ADDED
//         console.log("Program State Key (Test):", programState.toBase58()); // ADDED
    
    
//         await program.methods
//             .resolveEvent("outcome1")
//             .accounts({
//                 programState,
//                 event,
//                 eventPool,
//                 fee_pool_token_account: feePoolTokenAccount,
//                 tokenMint: mint,
//                 tokenProgram: TOKEN_PROGRAM_ID,
//                 systemProgram: SystemProgram.programId,
//                 rent: anchor.web3.SYSVAR_RENT_PUBKEY, 
//             })
//             .rpc();
//         console.log("Event resolved");
    
//         // Get balances AFTER resolveEvent (include feePoolTokenAccount now)
//         const eventPoolAccountAfterResolve = await getAccount(provider.connection, eventPool);
//         const feePoolAccountAfterResolve = await getAccount(provider.connection, feePoolTokenAccount); // Get Fee Pool ATA balance
//         const finalEventPoolBalanceResolve = new anchor.BN(eventPoolAccountAfterResolve.amount.toString());
//         const finalFeePoolTokenAccountBalanceResolve = new anchor.BN(feePoolAccountAfterResolve.amount.toString());
    
    
//         // Optionally, verify event resolution (e.g., fetch event account)
//         const fetchedEvent = await program.account.event.fetch(event);
//         assert.isTrue(fetchedEvent.resolved, "Event should be resolved");
//         assert.equal(fetchedEvent.winningOutcome, "outcome1", "Winning outcome should be 'outcome1'");
    
//         // ++++++++ ADDED FEE TRANSFER ASSERTIONS ++++++++
//         const feePercentageBasisPoints = 100; // As defined in initialize (1%)
//         const expectedFee = initialEventPoolBalanceResolve.muln(feePercentageBasisPoints).divn(10000); // Calculate expected fee (1%)
//         console.log("Initial Event Pool Balance (resolve):", initialEventPoolBalanceResolve.toString());
//         console.log("Expected Fee:", expectedFee.toString());
//         console.log("Fee Pool Balance BEFORE resolve:", initialFeePoolTokenAccountBalanceResolve.toString());
//         console.log("Fee Pool Balance AFTER resolve:", finalFeePoolTokenAccountBalanceResolve.toString());
//         console.log("Event Pool Balance BEFORE resolve:", initialEventPoolBalanceResolve.toString());
//         console.log("Event Pool Balance AFTER resolve:", finalEventPoolBalanceResolve.toString());
    
    
//         assert.isTrue(finalFeePoolTokenAccountBalanceResolve.eq(initialFeePoolTokenAccountBalanceResolve.add(expectedFee)), "Fee Pool Token Account balance should increase by fee amount");
//         assert.isTrue(finalEventPoolBalanceResolve.eq(initialEventPoolBalanceResolve.sub(expectedFee)), "Event Pool balance should decrease by fee amount");
//         // ++++++++ END ADDED FEE TRANSFER ASSERTIONS ++++++++
//     });

    
// });