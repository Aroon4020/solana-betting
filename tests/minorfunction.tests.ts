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
// import { PublicKey, SystemProgram, Transaction, Keypair, Connection, Provider } from "@solana/web3.js";

// describe("event-betting - Individual Function Tests", () => {
//     // Configure the client to use the local cluster.
//     anchor.setProvider(anchor.AnchorProvider.env());

//     const program = anchor.workspace.EventBetting as Program<EventBetting>;
//     const provider = anchor.getProvider() as anchor.AnchorProvider;
//     const connection = provider.connection;

//     // Accounts - Reused for all tests
//     let owner: Keypair;
//     let programStatePda: PublicKey;
//     let programAuthorityPda: PublicKey;
//     let feePool: PublicKey;
//     let tokenMint: Keypair;
//     let ownerTokenAccount: PublicKey;


//     const FEE_PERCENTAGE = new anchor.BN(1000); // 10%
//     const INITIAL_VOUCHER_FUNDS = new anchor.BN(1000000);
//     const NEW_SIGNER = Keypair.generate().publicKey;
//     const NEW_OWNER = Keypair.generate().publicKey;


//     before(async () => {
//         owner = Keypair.generate();
//         tokenMint = Keypair.generate();

//         [programStatePda, ] = PublicKey.findProgramAddressSync(
//             [Buffer.from("program_state")],
//             program.programId
//         );
//         [programAuthorityPda, ] = PublicKey.findProgramAddressSync(
//             [Buffer.from("program_authority")],
//             program.programId
//         );
//         [feePool, ] = PublicKey.findProgramAddressSync(
//             [Buffer.from("program_state"), Buffer.from("fee_pool")],
//             program.programId
//         );


//         ownerTokenAccount = await getAssociatedTokenAddress(tokenMint.publicKey, owner.publicKey);


//         //await connection.confirmTransaction(await connection.requestAirdrop(owner.publicKey, 2 * anchor.LAMPORTS_PER_SOL), "confirmed");
//         await Promise.all([
//                         connection.requestAirdrop(owner.publicKey, 100 * anchor.web3.LAMPORTS_PER_SOL),
//                         connection.requestAirdrop(provider.wallet.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
//                     ]).then(signatures => Promise.all(signatures.map(sig => provider.connection.confirmTransaction(sig))));

//         await createMint(connection, owner, tokenMint, null, 0);
//         await createAssociatedTokenAccountInstruction(owner.publicKey, ownerTokenAccount, owner.publicKey, tokenMint.publicKey);


//         await mintTo(connection, owner, tokenMint.publicKey, ownerTokenAccount, owner, INITIAL_VOUCHER_FUNDS.mul(new anchor.BN(2))); // Mint more for fee pool funding and owner account


//         await program.methods.initialize(FEE_PERCENTAGE, NEW_SIGNER)
//             .accounts({
//                 programState: programStatePda,
//                 programAuthority: programAuthorityPda,
//                 owner: owner.publicKey,
//                 systemProgram: SystemProgram.programId,
//                 rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//             })
//             .signers([owner])
//             .rpc();

//         await program.methods.initializeFeePool()
//             .accounts({
//                 feePool: feePool,
//                 authority: owner.publicKey,
//                 programState: programStatePda,
//                 programAuthority: programAuthorityPda,
//                 tokenMint: tokenMint.publicKey,
//                 tokenProgram: TOKEN_PROGRAM_ID,
//                 systemProgram: SystemProgram.programId,
//                 rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//             })
//             .signers([owner])
//             .rpc();
//         await program.methods.addVoucherFunds(INITIAL_VOUCHER_FUNDS)
//             .accounts({
//                 programState: programStatePda,
//                 feePool: feePool,
//                 userTokenAccount: ownerTokenAccount, // Owner funds the fee pool initially
//                 fundSource: owner.publicKey,
//                 tokenProgram: TOKEN_PROGRAM_ID,
//                 systemProgram: SystemProgram.programId,
//             })
//             .signers([owner])
//             .rpc();
//     });

//     describe("create_event", () => {
//         it("create_event with voucher amount", async () => {
//             const event = Keypair.generate();
//             const description = "Will it rain tomorrow?";
//             const startTime = Date.now() / 1000 + 3600; // 1 hour from now
//             const deadline = Date.now() / 1000 + 3600 / 2;  // 30 min from now
//             const possibleOutcomes = ["Yes", "No"];
//             const EVENT_VOUCHER_AMOUNT = new anchor.BN(50000);

//             await program.methods.createEvent(description, new anchor.BN(startTime), new anchor.BN(deadline), possibleOutcomes, EVENT_VOUCHER_AMOUNT)
//                 .accounts({
//                     programState: programStatePda,
//                     event: event.publicKey,
//                     owner: owner.publicKey,
//                     systemProgram: SystemProgram.programId,
//                 })
//                 .signers([owner, event])
//                 .rpc();

//             const eventAccount = await program.account.event.fetch(event.publicKey);
//             assert.equal(eventAccount.description, description);
//             assert.deepEqual(eventAccount.possibleOutcomes, possibleOutcomes);
//             assert.equal(eventAccount.voucherAmount.toNumber(), EVENT_VOUCHER_AMOUNT.toNumber());

//             const programStateAccount = await program.account.programState.fetch(programStatePda);
//             assert.equal(programStateAccount.activeVouchersAmount.toNumber(), EVENT_VOUCHER_AMOUNT.toNumber());
//         });
//     });

//     describe("update_voucher_amount", () => {
//         it("update_voucher_amount", async () => {
//             const event = Keypair.generate();
//             const EVENT_VOUCHER_AMOUNT = new anchor.BN(50000);
//             const UPDATED_VOUCHER_AMOUNT = new anchor.BN(60000);
//              // First create an event
//              const description = "Will it rain tomorrow? update_voucher_amount";
//              const startTime = Date.now() / 1000 + 3600;
//              const deadline = Date.now() / 1000 + 3600 / 2;
//              const possibleOutcomes = ["Yes", "No"];

//              await program.methods.createEvent(description, new anchor.BN(startTime), new anchor.BN(deadline), possibleOutcomes, EVENT_VOUCHER_AMOUNT)
//                  .accounts({
//                      programState: programStatePda,
//                      event: event.publicKey,
//                      owner: owner.publicKey,
//                      systemProgram: SystemProgram.programId,
//                  })
//                  .signers([owner, event])
//                  .rpc();


//             await program.methods.updateVoucherAmount(UPDATED_VOUCHER_AMOUNT)
//                 .accounts({
//                     programState: programStatePda,
//                     event: event.publicKey,
//                     owner: owner.publicKey,
//                 })
//                 .signers([owner])
//                 .rpc();

//             const eventAccount = await program.account.event.fetch(event.publicKey);
//             assert.equal(eventAccount.voucherAmount.toNumber(), UPDATED_VOUCHER_AMOUNT.toNumber());

//             const programStateAccount = await program.account.programState.fetch(programStatePda);
//             assert.equal(programStateAccount.activeVouchersAmount.toNumber(), UPDATED_VOUCHER_AMOUNT.toNumber());
//         });
//     });

//     describe("revoke_event", () => {
//         it("revoke_event", async () => {
//             const event = Keypair.generate();
//             const EVENT_VOUCHER_AMOUNT = new anchor.BN(50000);
//             // First create an event
//             const description = "Will it rain tomorrow? revoke_event";
//             const startTime = Date.now() / 1000 + 3600;
//             const deadline = Date.now() / 1000 + 3600 / 2;
//             const possibleOutcomes = ["Yes", "No"];

//             await program.methods.createEvent(description, new anchor.BN(startTime), new anchor.BN(deadline), possibleOutcomes, EVENT_VOUCHER_AMOUNT)
//                 .accounts({
//                     programState: programStatePda,
//                     event: event.publicKey,
//                     owner: owner.publicKey,
//                     systemProgram: SystemProgram.programId,
//                 })
//                 .signers([owner, event])
//                 .rpc();


//             await program.methods.revokeEvent()
//                 .accounts({
//                     programState: programStatePda,
//                     event: event.publicKey,
//                     owner: owner.publicKey,
//                 })
//                 .signers([owner])
//                 .rpc();

//             const eventAccount = await program.account.event.fetch(event.publicKey);
//             assert.equal(eventAccount.voucherAmount.toNumber(), 0);

//             const programStateAccount = await program.account.programState.fetch(programStatePda);
//             assert.equal(programStateAccount.activeVouchersAmount.toNumber(), 0);
//         });
//     });

//     describe("increase_deadline", () => {
//         it("increase_deadline", async () => {
//             const event = Keypair.generate();
//             const EVENT_VOUCHER_AMOUNT = new anchor.BN(50000);
//             const INCREASED_DEADLINE = new anchor.BN(Date.now() / 1000 + 3600 * 24 * 2); // 2 days from now
//              // First create an event
//              const description = "Will it rain tomorrow? increase_deadline";
//              const startTime = Date.now() / 1000 + 3600;
//              const deadline = Date.now() / 1000 + 3600 / 2;
//              const possibleOutcomes = ["Yes", "No"];

//              await program.methods.createEvent(description, new anchor.BN(startTime), new anchor.BN(deadline), possibleOutcomes, EVENT_VOUCHER_AMOUNT)
//                  .accounts({
//                      programState: programStatePda,
//                      event: event.publicKey,
//                      owner: owner.publicKey,
//                      systemProgram: SystemProgram.programId,
//                  })
//                  .signers([owner, event])
//                  .rpc();


//             await program.methods.increaseDeadline(INCREASED_DEADLINE)
//                 .accounts({
//                     programState: programStatePda,
//                     event: event.publicKey,
//                     owner: owner.publicKey,
//                 })
//                 .signers([owner])
//                 .rpc();

//             const eventAccount = await program.account.event.fetch(event.publicKey);
//             assert.equal(eventAccount.deadline.toNumber(), INCREASED_DEADLINE.toNumber());
//         });
//     });

//     describe("update_fee_percentage", () => {
//         it("update_fee_percentage", async () => {
//             const NEW_FEE_PERCENTAGE = new anchor.BN(500); // 5%
//             await program.methods.updateFeePercentage(NEW_FEE_PERCENTAGE)
//                 .accounts({
//                     programState: programStatePda,
//                     owner: owner.publicKey,
//                 })
//                 .signers([owner])
//                 .rpc();

//             const programStateAccount = await program.account.programState.fetch(programStatePda);
//             assert.equal(programStateAccount.feePercentage.toNumber(), NEW_FEE_PERCENTAGE.toNumber());
//         });
//     });

//     describe("add_voucher_funds", () => {
//         it("add_voucher_funds", async () => {
//             const initialFees = (await program.account.programState.fetch(programStatePda)).accumulatedFees;
//             const addAmount = new anchor.BN(500000);

//             await program.methods.addVoucherFunds(addAmount)
//                 .accounts({
//                     programState: programStatePda,
//                     feePool: feePool,
//                     userTokenAccount: ownerTokenAccount, // Owner adds more funds
//                     fundSource: owner.publicKey,
//                     tokenProgram: TOKEN_PROGRAM_ID,
//                     systemProgram: SystemProgram.programId,
//                 })
//                 .signers([owner])
//                 .rpc();

//             const programStateAccount = await program.account.programState.fetch(programStatePda);
//             assert.equal(programStateAccount.accumulatedFees.toNumber(), initialFees.add(addAmount).toNumber());
//         });
//     });

//     describe("initialize_user_bet", () => {
//         it("initialize_user_bet", async () => {
//             const user = Keypair.generate();
//             const event = Keypair.generate();
//             const userBetPda = PublicKey.findProgramAddressSync(
//                 [Buffer.from("user_bet"), user.publicKey.toBytes(), event.publicKey.toBytes()],
//                 program.programId
//             )[0];

//             // Create a dummy event account for user_bet initialization to work
//             const description = "Dummy event for user bet init";
//             const startTime = Date.now() / 1000 + 3600;
//             const deadline = Date.now() / 1000 + 3600 / 2;
//             const possibleOutcomes = ["Yes", "No"];
//             const EVENT_VOUCHER_AMOUNT = new anchor.BN(0); // No voucher needed for this test

//             await program.methods.createEvent(description, new anchor.BN(startTime), new anchor.BN(deadline), possibleOutcomes, EVENT_VOUCHER_AMOUNT)
//                 .accounts({
//                     programState: programStatePda,
//                     event: event.publicKey,
//                     owner: owner.publicKey,
//                     systemProgram: SystemProgram.programId,
//                 })
//                 .signers([owner, event])
//                 .rpc();


//             await program.methods.initializeUserBet()
//                 .accounts({
//                     userBet: userBetPda,
//                     event: event.publicKey,
//                     user: user.publicKey,
//                     systemProgram: SystemProgram.programId,
//                 })
//                 .signers([user])
//                 .rpc();

//             const userBetAccount = await program.account.userBet.fetch(userBetPda);
//             assert.deepEqual(userBetAccount.user, user.publicKey);
//             assert.equal(userBetAccount.eventId.toNumber(), event.publicKey.toBytes()[0]); // Assuming event ID is derived from event key
//         });
//     });

//     describe("update_signer", () => {
//         it("update_signer", async () => {
//             const NEW_SIGNER = Keypair.generate().publicKey;
//             await program.methods.updateSigner(NEW_SIGNER)
//                 .accounts({
//                     programState: programStatePda,
//                     owner: owner.publicKey,
//                 })
//                 .signers([owner])
//                 .rpc();

//             const programStateAccount = await program.account.programState.fetch(programStatePda);
//             assert.deepEqual(programStateAccount.signer, NEW_SIGNER);
//         });
//     });

//     describe("update_owner", () => {
//         it("update_owner", async () => {
//             const NEW_OWNER = Keypair.generate().publicKey;
//             await program.methods.updateOwner(NEW_OWNER)
//                 .accounts({
//                     programState: programStatePda,
//                     owner: owner.publicKey,
//                 })
//                 .signers([owner])
//                 .rpc();

//             const programStateAccount = await program.account.programState.fetch(programStatePda);
//             assert.deepEqual(programStateAccount.owner, NEW_OWNER);
//         });
//     });
// });