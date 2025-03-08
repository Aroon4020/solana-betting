import * as anchor from "@coral-xyz/anchor";
import { Program, web3 } from "@coral-xyz/anchor";
import { EventBetting } from "../target/types/event_betting";
import { assert } from "chai";
import {
  createMint,
  getAssociatedTokenAddress,
  getAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { Buffer } from "buffer";

anchor.setProvider(anchor.AnchorProvider.env());
const provider = anchor.getProvider() as anchor.AnchorProvider;
const program = anchor.workspace.EventBetting as Program<EventBetting>;

// Global constants and variables
const BETTING_STATE_SEED = "program_state";
const FEE_POOL_SEED = "fee_pool";
const EVENT_SEED = "event";
const USER_BET_SEED = "user_bet";

let owner = Keypair.generate();
let user = Keypair.generate();
let programAuthority = Keypair.generate();

let tokenMint: PublicKey;
let programStatePDA: PublicKey;
let feePoolPDA: PublicKey;
let eventPDA: PublicKey;
let eventPoolPDA: PublicKey;
let userBetPDA: PublicKey;
let currentEventId: anchor.BN;
let eventStartTime: number; // new global variable for event start time

describe("EventBetting Program Tests", () => {
  it("Setup and initialize program", async () => {
    // Airdrop SOL to owner and user
    await Promise.all([
      provider.connection.requestAirdrop(owner.publicKey, 100 * LAMPORTS_PER_SOL),
      provider.connection.requestAirdrop(user.publicKey, 50 * LAMPORTS_PER_SOL),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Create token mint
    tokenMint = await createMint(
      provider.connection,
      owner,
      owner.publicKey,
      null,
      9
    );
    console.log("Token mint created:", tokenMint.toBase58());

    // Derive PDAs for program state and fee pool
    [programStatePDA] = await PublicKey.findProgramAddress(
      [Buffer.from(BETTING_STATE_SEED)],
      program.programId
    );
    [feePoolPDA] = await PublicKey.findProgramAddress(
      [Buffer.from(BETTING_STATE_SEED), Buffer.from(FEE_POOL_SEED)],
      program.programId
    );
    console.log("Program state PDA:", programStatePDA.toBase58());
    console.log("Fee pool PDA:", feePoolPDA.toBase58());

    // Initialize program state
    await program.methods
      .initialize(new anchor.BN(1000), programAuthority.publicKey, tokenMint)
      .accounts({
        programState: programStatePDA,
        feePool: feePoolPDA,
        owner: owner.publicKey,
        tokenMint: tokenMint,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([owner])
      .rpc();
    console.log("Program state initialized.");
  });

  it("Add voucher funds", async () => {
    // Ensure owner's ATA exists
    const ownerTokenAccount = await getAssociatedTokenAddress(tokenMint, owner.publicKey);
    try {
      await getAccount(provider.connection, ownerTokenAccount);
    } catch {
      const ix = createAssociatedTokenAccountInstruction(
        owner.publicKey,
        ownerTokenAccount,
        owner.publicKey,
        tokenMint
      );
      const tx = new Transaction().add(ix);
      await provider.sendAndConfirm(tx, [owner]);
    }
    // Mint tokens to owner's ATA
    await mintTo(
      provider.connection,
      owner,
      tokenMint,
      ownerTokenAccount,
      owner,
      1000000000
    );
    const voucherAmount = new anchor.BN(50000);
    await program.methods
      .addVoucherFunds(voucherAmount)
      .accounts({
        programState: programStatePDA,
        userTokenAccount: ownerTokenAccount,
        feePool: feePoolPDA,
        fundSource: owner.publicKey,
        tokenMint: tokenMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([owner])
      .rpc();
    console.log("Voucher funds added:", voucherAmount.toString());
    // Assert fee pool increased.
    const feePoolAcct = await getAccount(provider.connection, feePoolPDA);
    assert.isTrue(new anchor.BN(feePoolAcct.amount.toString()).gte(voucherAmount));
  });

  it("Create an event and initialize event pool", async () => {
    const eventDescription = "Test Event";
    const now = Math.floor(Date.now() / 1000);
    // Use minimal start time but longer deadline to allow bets
    const startTime = now + 2;
    const deadline = now + 30; // Updated: extend deadline to 30 seconds from now
    const outcomes = ["Outcome 1", "Outcome 2"];
    const voucherAmt = 30000;

    const programState = await program.account.programState.fetch(programStatePDA);
    currentEventId = new anchor.BN(programState.next_event_id);
    eventStartTime = startTime; // store minimal start time
    [eventPDA] = await PublicKey.findProgramAddress(
      [
        Buffer.from(EVENT_SEED),
        currentEventId.toArrayLike(Buffer, "le", 8)
      ],
      program.programId
    );
    [eventPoolPDA] = await PublicKey.findProgramAddress(
      [
        Buffer.from(EVENT_SEED),
        currentEventId.toArrayLike(Buffer, "le", 8),
        Buffer.from("pool")
      ],
      program.programId
    );
    await program.methods
      .createEvent(
        eventDescription,
        new anchor.BN(startTime), 
        new anchor.BN(deadline),
        outcomes,
        new anchor.BN(voucherAmt)
      )
      .accounts({
        programState: programStatePDA,
        event: eventPDA,
        owner: owner.publicKey,
        tokenMint: tokenMint,
        eventPool: eventPoolPDA,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();
    console.log("Event created with ID:", currentEventId.toString());
    const eventAccount = await program.account.event.fetch(eventPDA);
    assert.equal(eventAccount.description, eventDescription);

    // [eventPoolPDA] = await PublicKey.findProgramAddress(
    //   [
    //     Buffer.from(EVENT_SEED),
    //     currentEventId.toArrayLike(Buffer, "le", 8),
    //     Buffer.from("pool")
    //   ],
    //   program.programId
    // );
    // await program.methods
    //   .initializeEventPool()
    //   .accounts({
    //     event: eventPDA,
    //     eventPool: eventPoolPDA,
    //     payer: owner.publicKey,
    //     tokenMint: tokenMint,
    //     systemProgram: SystemProgram.programId,
    //     tokenProgram: TOKEN_PROGRAM_ID,
    //     rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    //   })
    //   .signers([owner])
    //   .rpc();
    // console.log("Event pool initialized:", eventPoolPDA.toBase58());
  });

  it("Place bet without voucher", async () => {
    // Wait until event start time with extra margin of 2 seconds.
    let currentTime = Math.floor(Date.now() / 1000);
    const waitMargin = 2; // extra seconds margin
    if (currentTime < eventStartTime + waitMargin) {
      const delay = ((eventStartTime + waitMargin) - currentTime) * 1000;
      console.log("Waiting", delay, "ms for betting to start (with margin)");
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    // Ensure user's ATA exists and fund it
    const userTokenAccount = await getAssociatedTokenAddress(tokenMint, user.publicKey);
    try {
      await getAccount(provider.connection, userTokenAccount);
    } catch {
      const ix = createAssociatedTokenAccountInstruction(
        owner.publicKey,
        userTokenAccount,
        user.publicKey,
        tokenMint
      );
      const tx = new Transaction().add(ix);
      await provider.sendAndConfirm(tx, [owner]);
    }
    await mintTo(
      provider.connection,
      owner,
      tokenMint,
      userTokenAccount,
      owner,
      500000000
    );
    const outcome = "Outcome 1";
    const betAmount = new anchor.BN(5000);
    const voucherAmount = new anchor.BN(0);
    // Change: derive userBetPDA using currentEventId rather than eventPDA.toBuffer()
    [userBetPDA] = await PublicKey.findProgramAddress(
      [
        Buffer.from(USER_BET_SEED),
        user.publicKey.toBuffer(),
        currentEventId.toArrayLike(Buffer, "le", 8)
      ],
      program.programId
    );
    await program.methods
      .placeBet(outcome, betAmount, voucherAmount)
      .accounts({
        programState: programStatePDA,
        adminSigner: programAuthority.publicKey,
        event: eventPDA,
        userBet: userBetPDA,
        userTokenAccount: userTokenAccount,
        eventPool: eventPoolPDA,
        feePool: feePoolPDA,
        user: user.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user, programAuthority])
      .rpc();
    console.log("Bet placed without voucher by user:", user.publicKey.toBase58());
    const userBetAccount = await program.account.userBet.fetch(userBetPDA);
    assert.isTrue(userBetAccount.amount.eq(betAmount));
  });

  it("Place bet with voucher", async () => {
    // Fund user's ATA additionally if needed
    const userTokenAccount = await getAssociatedTokenAddress(tokenMint, user.publicKey);
    await mintTo(
      provider.connection,
      owner,
      tokenMint,
      userTokenAccount,
      owner,
      500000000
    );
    const outcome = "Outcome 1";
    const betAmount = new anchor.BN(5000);
    const voucherAmount = new anchor.BN(2000);
    // Derive userBetPDA using currentEventId
    [userBetPDA] = await PublicKey.findProgramAddress(
      [
        Buffer.from(USER_BET_SEED),
        user.publicKey.toBuffer(),
        currentEventId.toArrayLike(Buffer, "le", 8)
      ],
      program.programId
    );
    // Fetch the current user bet amount (if any)
    let existingAmount = new anchor.BN(0);
    try {
      const existingBet = await program.account.userBet.fetch(userBetPDA);
      existingAmount = existingBet.amount;
    } catch (err) {
      // No existing user bet, so set to 0.
    }
    await program.methods
      .placeBet(outcome, betAmount, voucherAmount)
      .accounts({
        programState: programStatePDA,
        adminSigner: programAuthority.publicKey,
        event: eventPDA,
        userBet: userBetPDA,
        userTokenAccount: userTokenAccount,
        eventPool: eventPoolPDA,
        feePool: feePoolPDA,
        user: user.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user, programAuthority])
      .rpc();
    console.log("Bet placed with voucher by user:", user.publicKey.toBase58());
    const userBetAccount = await program.account.userBet.fetch(userBetPDA);
    // Expected total is the previous amount plus new bet amounts.
    const expectedTotal = existingAmount.add(betAmount).add(voucherAmount);
    assert.isTrue(userBetAccount.amount.eq(expectedTotal));
  });

  it("Place bet without voucher with new user", async () => {
        // Generate a new user keypair
        let newUser = Keypair.generate();
        // Airdrop SOL to the new user
        await provider.connection.requestAirdrop(newUser.publicKey, 50 * LAMPORTS_PER_SOL);
    
        // Ensure new user's ATA exists and fund it
        const newUserTokenAccount = await getAssociatedTokenAddress(tokenMint, newUser.publicKey);
        try {
          await getAccount(provider.connection, newUserTokenAccount);
        } catch {
          const ix = createAssociatedTokenAccountInstruction(
            owner.publicKey,
            newUserTokenAccount,
            newUser.publicKey,
            tokenMint
          );
          const tx = new Transaction().add(ix);
          await provider.sendAndConfirm(tx, [owner]);
        }
        await mintTo(
          provider.connection,
          owner,
          tokenMint,
          newUserTokenAccount,
          owner,
          500000000
        );
    
        const outcome = "Outcome 2"; // Bet on a different outcome
        const betAmount = new anchor.BN(3000);
        const voucherAmount = new anchor.BN(0);
    
        // Derive userBetPDA for the new user
        const newUserBetPDA = await getAssociatedTokenAddress(
          tokenMint, // This PDA derivation is incorrect, it should use USER_BET_SEED
          newUser.publicKey
        );
        [userBetPDA] = await PublicKey.findProgramAddress(
          [
            Buffer.from(USER_BET_SEED),
            newUser.publicKey.toBuffer(),
            currentEventId.toArrayLike(Buffer, "le", 8)
          ],
          program.programId
        );
    
    
        await program.methods
          .placeBet(outcome, betAmount, voucherAmount)
          .accounts({
            programState: programStatePDA,
            adminSigner: programAuthority.publicKey,
            event: eventPDA,
            userBet: userBetPDA,
            userTokenAccount: newUserTokenAccount,
            eventPool: eventPoolPDA,
            feePool: feePoolPDA,
            user: newUser.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([newUser, programAuthority])
          .rpc();
        console.log("Bet placed without voucher by new user:", newUser.publicKey.toBase58());
    
        const newUserBetAccount = await program.account.userBet.fetch(userBetPDA);
        assert.isTrue(newUserBetAccount.amount.eq(betAmount));
     });

    it("Place bet with voucher with new user", async () => {
          // Generate another new user keypair
          let anotherNewUser = Keypair.generate();
          // Airdrop SOL to this new user
          await provider.connection.requestAirdrop(anotherNewUser.publicKey, 50 * LAMPORTS_PER_SOL);
      
          // Ensure new user's ATA exists and fund it
          const anotherUserTokenAccount = await getAssociatedTokenAddress(tokenMint, anotherNewUser.publicKey);
          try {
            await getAccount(provider.connection, anotherUserTokenAccount);
          } catch {
            const ix = createAssociatedTokenAccountInstruction(
              owner.publicKey,
              anotherUserTokenAccount,
              anotherNewUser.publicKey,
              tokenMint
            );
            const tx = new Transaction().add(ix);
            await provider.sendAndConfirm(tx, [owner]);
          }
          await mintTo(
            provider.connection,
            owner,
            tokenMint,
            anotherUserTokenAccount,
            owner,
            500000000
          );
      
          const outcome = "Outcome 2"; // Bet on Outcome 2
          const betAmount = new anchor.BN(2500);
          const voucherAmount = new anchor.BN(1500);
      
          // Derive userBetPDA for this another new user
          [userBetPDA] = await PublicKey.findProgramAddress(
            [
              Buffer.from(USER_BET_SEED),
              anotherNewUser.publicKey.toBuffer(),
              currentEventId.toArrayLike(Buffer, "le", 8)
            ],
            program.programId
          );
      
          // Fetch existing bet amount for this new user (should be zero or none)
          let existingAmountAnotherUser = new anchor.BN(0);
          try {
            const existingBetAnotherUser = await program.account.userBet.fetch(userBetPDA);
            existingAmountAnotherUser = existingBetAnotherUser.amount;
          } catch (err) {
            // No existing bet for this user, default to 0
          }
      
      
          await program.methods
            .placeBet(outcome, betAmount, voucherAmount)
            .accounts({
              programState: programStatePDA,
              adminSigner: programAuthority.publicKey,
              event: eventPDA,
              userBet: userBetPDA,
              userTokenAccount: anotherUserTokenAccount,
              eventPool: eventPoolPDA,
              feePool: feePoolPDA,
              user: anotherNewUser.publicKey,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .signers([anotherNewUser, programAuthority])
            .rpc();
          console.log("Bet placed with voucher by new user:", anotherNewUser.publicKey.toBase58());
      
          const anotherUserBetAccount = await program.account.userBet.fetch(userBetPDA);
          // Verify total bet amount for the new user, including voucher
          const expectedTotalAnotherUser = existingAmountAnotherUser.add(betAmount).add(voucherAmount);
          assert.isTrue(anotherUserBetAccount.amount.eq(expectedTotalAnotherUser));
        });  

  it("Resolve event", async () => {
    // Fetch event account to get the new (shortened) deadline.
    let eventAccount = await program.account.event.fetch(eventPDA);
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime < eventAccount.deadline) {
      const delay = (eventAccount.deadline - currentTime + 1) * 1000; // minimal wait time
      console.log("Waiting", delay, "ms for event deadline to pass");
      await new Promise((resolve) => setTimeout(resolve, delay+2000)); // Updated: add extra 2 seconds
    }
    await program.methods
      .resolveEvent("Outcome 1")
      .accounts({
        programState: programStatePDA,
        event: eventPDA,
        program_authority: programAuthority.publicKey,
        eventPool: eventPoolPDA,
        feePool: feePoolPDA,
        tokenMint: tokenMint,
        token_program: TOKEN_PROGRAM_ID,
        owner: owner.publicKey,
      })
      .signers([owner])
      .rpc();
    console.log("Event resolved.");
    eventAccount = await program.account.event.fetch(eventPDA);
    assert.isTrue(eventAccount.resolved);
  });

  it("Claim winnings", async () => {
    // --- Ensure we are using the correct event context ---
    // Fetch the event account again to be absolutely sure we're using the correct one.
    const eventAccountBeforeClaim = await program.account.event.fetch(eventPDA);
    const claimEventId = eventAccountBeforeClaim.id;

    // Derive userBetPDA again, ensuring we use the correct eventId
    [userBetPDA] = await PublicKey.findProgramAddress(
        [
            Buffer.from(USER_BET_SEED),
            user.publicKey.toBuffer(),
            claimEventId.toArrayLike(Buffer, "le", 8) // Use fetched event ID
        ],
        program.programId
    );
    console.log("Claim Winnings - Event PDA:", eventPDA.toBase58()); // Log event PDA
    console.log("Claim Winnings - UserBet PDA:", userBetPDA.toBase58()); // Log userBet PDA

    // --- Claim Winnings Transaction ---
    const userTokenAccount = await getAssociatedTokenAddress(tokenMint, user.publicKey);
    const before = await getAccount(provider.connection, userTokenAccount);
    await program.methods
        .claimWinnings()
        .accounts({
            event: eventPDA, // Use the same eventPDA from event creation
            userBet: userBetPDA, // Use the re-derived userBetPDA
            userTokenAccount: userTokenAccount,
            eventPool: eventPoolPDA, // Use the same eventPoolPDA from event creation
            user: user.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();
    console.log("Winnings claimed by user:", user.publicKey.toBase58());
    const after = await getAccount(provider.connection, userTokenAccount);
    assert.isTrue(new anchor.BN(after.amount.toString()).gt(new anchor.BN(before.amount.toString())));
});

  it("Withdraw fees", async () => {
    const ownerTokenAccount = await getAssociatedTokenAddress(tokenMint, owner.publicKey);
    const before = await getAccount(provider.connection, ownerTokenAccount);
    const withdrawAmt = new anchor.BN(100000);
    await program.methods
      .withdrawFees(withdrawAmt)
      .accounts({
        programState: programStatePDA,
        feePool: feePoolPDA,
        ownerTokenAccount: ownerTokenAccount,
        owner: owner.publicKey,
        program_authority: programAuthority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      })
      .signers([owner])
      .rpc();
    console.log("Fees withdrawn:", withdrawAmt.toString());
    const after = await getAccount(provider.connection, ownerTokenAccount);
    assert.isTrue(new anchor.BN(after.amount.toString()).gt(new anchor.BN(before.amount.toString())));
  });
});
