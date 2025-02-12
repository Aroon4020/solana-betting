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

// describe("claim_winnings", () => {
//   const provider = anchor.AnchorProvider.env();
//   anchor.setProvider(provider);
//   const program = anchor.workspace.EventBetting as Program<EventBetting>;

//   let mint: anchor.web3.PublicKey;
//   let eventId: number;
//   let event: anchor.web3.PublicKey;
//   let userTokenAccount: anchor.web3.PublicKey;
//   let eventPool: anchor.web3.PublicKey;
//   let userBet: anchor.web3.PublicKey;
//   let programState: anchor.web3.PublicKey;
//   let user: anchor.web3.Keypair;
//   let programAuthority: anchor.web3.PublicKey; // Add programAuthority
//   let feePool: anchor.web3.PublicKey; // Add feePool
  
//   beforeEach(async () => {
//     // Create new keypair for user
//     user = anchor.web3.Keypair.generate();
//     console.log("User public key: ", user.publicKey.toBase58());
//     // Airdrop SOL to user
//     const signature = await provider.connection.requestAirdrop(
//       user.publicKey,
//       2 * anchor.web3.LAMPORTS_PER_SOL
//     );
//     console.log("Airdrop signature: ", signature);
//     await provider.connection.confirmTransaction(signature);

//     // Create token mint
//     mint = await createMint(
//       provider.connection,
//       user,
//       user.publicKey,
//       null,
//       6
//     );
//     console.log("Mint: ", mint.toBase58());

//     // Create user token account
//     userTokenAccount = await getAssociatedTokenAddress(
//       mint,
//       user.publicKey
//     );
//     console.log("User token account: ", userTokenAccount.toBase58());
    
//     // Create the token account
//     const createATAIx = createAssociatedTokenAccountInstruction(
//       user.publicKey,
//       userTokenAccount,
//       user.publicKey,
//       mint
//     );
//     const tx = new anchor.web3.Transaction().add(createATAIx);
//     await provider.sendAndConfirm(tx, [user]);
//     console.log("User token account created");

//     // Mint tokens to user
//     await mintTo(
//       provider.connection,
//       user,
//       mint,
//       userTokenAccount,
//       user.publicKey,
//       1000000000 // 1000 tokens
//     );
//     console.log("Tokens minted to user");
//     // Initialize program state
//     [programAuthority] = anchor.web3.PublicKey.findProgramAddressSync(
//         [Buffer.from("program_authority")],
//         program.programId
//     );
//     console.log("Program authority: ", programAuthority.toBase58());

//     [programState] = anchor.web3.PublicKey.findProgramAddressSync(
//         [Buffer.from("program_state")],
//         program.programId
//     );
//     console.log("Program state: ", programState.toBase58()); // Log program state
//     // Initialize program with 2% fee
//     await program.methods
//             .initialize(new anchor.BN(100), user.publicKey)
//             .accounts({
//                 programState,
//                 owner: user.publicKey,
//                 systemProgram: anchor.web3.SystemProgram.programId,
//             })
//             .signers([user])
//             .rpc();
//       console.log("Program initialized");

//       [feePool] = anchor.web3.PublicKey.findProgramAddressSync(
//         [Buffer.from("program_state"), Buffer.from("fee_pool")],
//         program.programId
//     );
//     const feePoolMint = mint; // Or whatever mint your fee pool uses
//     await program.methods.initializeFeePool().accounts({
//         feePool,
//         authority: user.publicKey,
//         programState,
//         tokenMint: feePoolMint,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         systemProgram: anchor.web3.SystemProgram.programId,
//         rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//     }).signers([user]).rpc();
//     // Create event
//     eventId = 0;
//     const eventIdBuffer = Buffer.from(new Array(8).fill(0));
//     eventIdBuffer.writeUInt32LE(eventId, 0);
//     console.log("Event ID: ", eventId);
//     [event] = anchor.web3.PublicKey.findProgramAddressSync(
//       [Buffer.from("event"), eventIdBuffer],
//       program.programId
//     );

//     const startTime = Math.floor(Date.now() / 1000);
//     const deadline = startTime + 3600; // 1 hour from now
//     const now = Math.floor(Date.now() / 1000);
//     await program.methods
//       .createEvent(
//         "Test Event",
//         new anchor.BN(now + 1), // Start time just slightly in future
//         new anchor.BN(now + 2),
//         ["outcome1", "outcome2"],
//         new anchor.BN(0)
//       )
//       .accounts({
//         programState,
//         event,
//         owner: user.publicKey,
//         systemProgram: anchor.web3.SystemProgram.programId,
//       })
//       .signers([user])
//       .rpc();
//       console.log("Event created");

//     // Initialize event pool
//     [eventPool] = anchor.web3.PublicKey.findProgramAddressSync(
//         [Buffer.from("event"), eventIdBuffer, Buffer.from("pool")],
//         program.programId
//     );
    
//     await program.methods
//         .initializeEventPool()
//         .accounts({
//             event,
//             eventPool,
//             payer: user.publicKey,
//             tokenMint: mint, // Use the correct mint for the event pool
//             systemProgram: anchor.web3.SystemProgram.programId,
//             tokenProgram: TOKEN_PROGRAM_ID,
//             rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//             programAuthority, // <--- Add programAuthority here! This is critical.
//         })
//         .signers([user])
//         .rpc();

//     // Initialize user bet
//     [userBet] = anchor.web3.PublicKey.findProgramAddressSync(
//       [Buffer.from("user_bet"), user.publicKey.toBuffer(), eventIdBuffer],
//       program.programId
//     );

//     await program.methods
//       .initializeUserBet()
//       .accounts({
//         userBet,
//         event,
//         user: user.publicKey,
//         systemProgram: anchor.web3.SystemProgram.programId,
//       })
//       .signers([user])
//       .rpc();

//     // Place bet
//     const betAmount = new anchor.BN(100000000); // 100 tokens
//     await program.methods
//       .placeBet("outcome1", betAmount)
//       .accounts({
//         event,
//         userBet,
//         userTokenAccount,
//         eventPool,
//         user: user.publicKey,
//         tokenProgram: TOKEN_PROGRAM_ID,
//       })
//       .signers([user])
//       .rpc();
//       console.log("Bet placed");
//     // Fast forward time
//     await provider.connection.confirmTransaction(
//       await provider.connection.requestAirdrop(user.publicKey, anchor.web3.LAMPORTS_PER_SOL)
//     );
//     await new Promise(resolve => setTimeout(resolve, 3000));
//     // Resolve event
//     await program.methods
//       .resolveEvent("outcome1")
//       .accounts({
//         programState,
//         event,
//         owner: user.publicKey,
//       })
//       .signers([user])
//       .rpc();
//       console.log("Event resolved");
//   });

//   it("should successfully claim winnings", async () => {
//     // Get initial balances
//     const initialUserBalance = (await getAccount(provider.connection, userTokenAccount)).amount;
//     const initialPoolBalance = (await getAccount(provider.connection, eventPool)).amount;

//     // Claim winnings
//     await program.methods
//       .claimWinnings()
//       .accounts({
//         event,
//         userBet,
//         userTokenAccount,
//         eventPool,
//         user: user.publicKey,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         programAuthority,
//       })
//       .signers([user])
//       .rpc();

//     // Get final balances
//     const finalUserBalance = (await getAccount(provider.connection, userTokenAccount)).amount;
//     const finalPoolBalance = (await getAccount(provider.connection, eventPool)).amount;
//     const userBetAccount = await program.account.userBet.fetch(userBet);

//     // Verify balances and state
//     assert.equal(userBetAccount.amount.toString(), "0", "User bet amount should be reset to 0");
//     assert(finalUserBalance > initialUserBalance, "User balance should increase");
//     assert(finalPoolBalance < initialPoolBalance, "Pool balance should decrease");
//   });

//   it("should fail to claim winnings twice", async () => {
//     // First claim should succeed
//     await program.methods
//       .claimWinnings()
//       .accounts({
//         event,
//         userBet,
//         userTokenAccount,
//         eventPool,
//         user: user.publicKey,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         programAuthority,
//       })
//       .signers([user])
//       .rpc();

//     // Second claim should fail
//     try {
//       await program.methods
//         .claimWinnings()
//         .accounts({
//           event,
//           userBet,
//           userTokenAccount,
//           eventPool,
//           user: user.publicKey,
//           tokenProgram: TOKEN_PROGRAM_ID,
//             programAuthority,
//         })
//         .signers([user])
//         .rpc();
//       assert.fail("Should have thrown error");
//     } catch (error) {
//       assert.include(error.toString(), "NoWinningsToClaim");
//     }
//   });
// });