
// import {
//   createMint,
//   getAssociatedTokenAddress,
//   getAccount,
//   mintTo,
//   TOKEN_PROGRAM_ID,
//   ASSOCIATED_TOKEN_PROGRAM_ID,
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

// anchor.setProvider(anchor.AnchorProvider.env());
// const provider = anchor.getProvider() as anchor.AnchorProvider;
// const program = anchor.workspace.EventBetting as Program<EventBetting>;

// // Constants (match those in your program)
// const BETTING_STATE_SEED = "program_state";
// const FEE_POOL_SEED = "fee_pool";
// const EVENT_SEED = "event";
// const USER_BET_SEED = "user_bet";

// describe("EventBetting Program Tests", () => {
//   let owner = Keypair.generate();
//   let user = Keypair.generate();
//   let programAuthority = Keypair.generate();

//   let tokenMint: PublicKey;
//   let programStatePDA: PublicKey;
//   let feePoolPDA: PublicKey;
//   let eventPDA: PublicKey;
//   let userBetPDA: PublicKey;
//   let eventPoolPDA: PublicKey;  let eventPoolPDA: PublicKey;
//   let currentEventId: anchor.BN;anchor.BN;

//   before(async () => {
//     // Airdrop SOL to owner and user
//     await Promise.all([
//       provider.connection.requestAirdrop(owner.publicKey, 100 * LAMPORTS_PER_SOL),
//       provider.connection.requestAirdrop(user.publicKey, 50 * LAMPORTS_PER_SOL),
//     ]);
//     // Wait for airdrops to finalize
//     await new Promise((resolve) => setTimeout(resolve, 2000));

//     // Create token mint
//     tokenMint = await createMint(
//       provider.connection,
//       owner,
//       owner.publicKey,
//       null,
//       9
//     );
//     console.log("Token mint created:", tokenMint.toBase58());

//     // Derive PDAs for program state and fee pool
//     [programStatePDA] = await PublicKey.findProgramAddress(
//       [Buffer.from(BETTING_STATE_SEED)],
//       program.programId
//     );
//     [feePoolPDA] = await PublicKey.findProgramAddress(
//       [Buffer.from(BETTING_STATE_SEED), Buffer.from(FEE_POOL_SEED)],
//       program.programId
//     );
//     console.log("Program state PDA:", programStatePDA.toBase58());
//     console.log("Fee pool PDA:", feePoolPDA.toBase58());

//     // Initialize the program state
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
//     console.log("Program state initialized.");
//   });

//   it("should add voucher funds", async () => {
//     // Ensure owner has an associated token account
//     const ownerTokenAccount = await getAssociatedTokenAddress(
//       tokenMint,
//       owner.publicKey
//     );
//     try {
//       await getAccount(provider.connection, ownerTokenAccount);
//     } catch {
//       const ix = createAssociatedTokenAccountInstruction(
//         owner.publicKey,
//         ownerTokenAccount,
//         owner.publicKey,
//         tokenMint
//       );
//       const tx = new Transaction().add(ix);
//       await provider.sendAndConfirm(tx, [owner]);
//     }
//     // Mint tokens to owner's token account
//     await mintTo(
//       provider.connection,
//       owner,
//       tokenMint,
//       ownerTokenAccount,
//       owner,
//       1000000000
//     );

//     const voucherAmount = new anchor.BN(50000);
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
//     console.log("Voucher funds added:", voucherAmount.toString());

//     const feePoolAcct = await getAccount(provider.connection, feePoolPDA);
//     assert.isTrue(
//       new anchor.BN(feePoolAcct.amount.toString()).gte(voucherAmount),
//       "Fee pool balance should increase by voucher amount"
//     );
//   });

//   // ...existing code...

//   it("should create an event", async () => {
//     const eventDescription = "Test Event";
//     const now = Math.floor(Date.now() / 1000);
//     const startTime = now + 10;
//     const deadline = startTime + 60;
//     const outcomes = ["Outcome 1", "Outcome 2"];
//     const voucherAmt = 30000;

//     // Get current event ID from program state
//     const programState = await program.account.programState.fetch(programStatePDA);
//     const eventId = programState.nextEventId;

//     // Create event PDA using event ID - Fixed buffer conversion
//     [eventPDA] = await PublicKey.findProgramAddress(
//       [
//         Buffer.from(EVENT_SEED),
//         eventId.toArrayLike(Buffer, "le", 8)  // Fix: Use proper BN conversion
//       ],
//       program.programId
//     );

//     await program.methods
//       .createEvent(
//         eventDescription,
//         new anchor.BN(startTime),  // Fix: Convert to BN
//         new anchor.BN(deadline),   // Fix: Convert to BN
//         outcomes,
//         new anchor.BN(voucherAmt)
//       )
//       .accounts({
//         programState: programStatePDA,
//         event: eventPDA,
//         owner: owner.publicKey,
//         systemProgram: SystemProgram.programId,
//       })
//       .signers([owner])
//       .rpc();

//     console.log("Event created with ID:", eventId.toString());

//     const eventAccount = await program.account.event.fetch(eventPDA);
//     assert.equal(eventAccount.description, eventDescription);

//     // Initialize event pool
//     const [eventPoolPDA] = await PublicKey.findProgramAddress(
//       [
//         Buffer.from(EVENT_SEED),
//         eventId.toArrayLike(Buffer, "le", 8),
//         Buffer.from("pool")
//       ],
//       program.programId
//     );

//     await program.methods
//       .initializeEventPool()
//       .accounts({
//         event: eventPDA,
//         eventPool: eventPoolPDA,
//         payer: owner.publicKey,
//         tokenMint: tokenMint,
//         systemProgram: SystemProgram.programId,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//       })
//       .signers([owner])
//       .rpc();

//     console.log("Event pool initialized:", eventPoolPDA.toBase58());
//   });

//   // ...existing code...

//   it("should place bet with voucher", async () => {
//     // Initialize user's token account
//     const userTokenAccount = await getAssociatedTokenAddress(
//       tokenMint,
//       user.publicKey
//     );
//     try {
//       await getAccount(provider.connection, userTokenAccount);
//     } catch {
//       const ix = createAssociatedTokenAccountInstruction(
//         owner.publicKey,
//         userTokenAccount,
//         user.publicKey,
//         tokenMint
//       );
//       const tx = new Transaction().add(ix);
//       await provider.sendAndConfirm(tx, [owner]);
//     }

//     // Mint some tokens to user's account for betting
//     await mintTo(
//       provider.connection,
//       owner,
//       tokenMint,
//       userTokenAccount,
//       owner,
//       1000000000
//     );

//     // Rest of the betting logic
//     const outcome = "Outcome 1";
//     const betAmount = new anchor.BN(5000);
//     const voucherAmount = new anchor.BN(2000);
//     const nonce = new anchor.BN(0);

//     [userBetPDA] = await PublicKey.findProgramAddress(
//         [
//             Buffer.from(USER_BET_SEED),
//             user.publicKey.toBuffer(),
//             eventPDA.toBuffer(),
//         ],
//         program.programId
//     );

//     // Get event pool PDA
//     const [eventPoolPDA] = await PublicKey.findProgramAddress(
//       [
//         Buffer.from(EVENT_SEED),
//         eventId.toArrayLike(Buffer, "le", 8),
//         Buffer.from("pool")
//       ],
//       program.programId
//     );

//     await program.methods
//         .placeBet(outcome, betAmount, voucherAmount)
//         .accounts({
//             programState: programStatePDA,
//             adminSigner: programAuthority.publicKey,
//             event: eventPDA,
//             userBet: userBetPDA,
//             userTokenAccount: userTokenAccount,
//             eventPool: eventPoolPDA, // Use eventPoolPDA instead of eventPDA
//             feePool: feePoolPDA,
//             user: user.publicKey,
//             tokenProgram: TOKEN_PROGRAM_ID,
//             systemProgram: SystemProgram.programId,
//         })
//         .signers([user, programAuthority])
//         .rpc();

//     console.log("Bet placed with voucher by user:", user.publicKey.toBase58());

//     const userBetAccount = await program.account.userBet.fetch(userBetPDA);
//     assert.isTrue(
//         userBetAccount.amount.eq(betAmount.add(voucherAmount)),
//         "User bet amount should equal sum of bet and voucher amounts"
//     );
// });

//   it("should resolve event", async () => {
//     // Wait for event deadline to pass
//     await new Promise((resolve) => setTimeout(resolve, 15000));
//     await program.methods
//       .resolveEvent("Outcome 1")
//       .accounts({
//         programState: programStatePDA,
//         event: eventPDA,
//         program_authority: programAuthority.publicKey,
//         eventPool: eventPDA, // Adjust accordingly
//         feePool: feePoolPDA,
//         tokenMint: tokenMint,
//         token_program: TOKEN_PROGRAM_ID,
//         owner: owner.publicKey,
//       })
//       .signers([owner])
//       .rpc();
//     console.log("Event resolved.");
//     const eventAccount = await program.account.event.fetch(eventPDA);
//     assert.isTrue(eventAccount.resolved, "Event should be resolved");
//   });

//   it("should claim winnings", async () => {
//     const userTokenAccount = await getAssociatedTokenAddress(tokenMint, user.publicKey);
//     const before = await getAccount(provider.connection, userTokenAccount);
//     await program.methods
//       .claimWinnings()
//       .accounts({
//         event: eventPDA,
//         userBet: userBetPDA,
//         userTokenAccount: userTokenAccount,
//         eventPool: eventPDA, // Adjust accordingly
//         user: user.publicKey,
//         tokenProgram: TOKEN_PROGRAM_ID,
//       })
//       .signers([user])
//       .rpc();
//     console.log("Winnings claimed by user:", user.publicKey.toBase58());
//     const after = await getAccount(provider.connection, userTokenAccount);
//     assert.isTrue(
//       new anchor.BN(after.amount.toString()).gt(new anchor.BN(before.amount.toString())),
//       "User token account should increase after claiming winnings"
//     );
//   });

//   it("should withdraw fees", async () => {
//     const ownerTokenAccount = await getAssociatedTokenAddress(tokenMint, owner.publicKey);
//     const before = await getAccount(provider.connection, ownerTokenAccount);
//     const withdrawAmt = new anchor.BN(10000);
//     await program.methods
//       .withdrawFees(withdrawAmt)
//       .accounts({
//         programState: programStatePDA,
//         feePool: feePoolPDA,
//         ownerTokenAccount: ownerTokenAccount,
//         owner: owner.publicKey,
//         program_authority: programAuthority.publicKey,
//         token_program: TOKEN_PROGRAM_ID,
//         systemProgram: SystemProgram.programId,
//         rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//         clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
//       })
//       .signers([owner])
//       .rpc();
//     console.log("Fees withdrawn:", withdrawAmt.toString());
//     const after = await getAccount(provider.connection, ownerTokenAccount);
//     assert.isTrue(
//       new anchor.BN(after.amount.toString()).gt(new anchor.BN(before.amount.toString())),
//       "Owner token account should increase after withdrawal"
//     );
//   });
// });