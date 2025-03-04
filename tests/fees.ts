import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { EventBetting } from "../target/types/event_betting";
import { assert } from "chai";
import {
    createMint,
    createAccount,
    mintTo,
    TOKEN_PROGRAM_ID,
    getAccount as getTokenAccount,
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { PublicKey, SystemProgram, Transaction, Keypair, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Buffer } from 'buffer';

describe("event-betting extended tests: place_bet_with_voucher", () => {

    // Configure the client to use the local cluster.
    anchor.setProvider(anchor.AnchorProvider.env());
    const program = anchor.workspace.EventBetting as Program<EventBetting>;
    const provider = anchor.getProvider() as anchor.AnchorProvider;
    const connection = provider.connection;

    // Accounts - Reused and some new ones
    let owner: Keypair;
    let user: Keypair;
    let programAuthority: Keypair;

    let programStatePDA: PublicKey;
    let eventPDA: PublicKey;
    let eventPoolPDA: PublicKey;
    let feePoolPDA: PublicKey;
    let programAuthorityPDAAccount: PublicKey;

    let tokenMint: PublicKey;
    let ownerTokenAccount: PublicKey;
    let feePoolTokenAccount: PublicKey;
    let eventPoolTokenAccount_EVENT: PublicKey;
    let userTokenAccount: PublicKey;
    let userBetPDA: PublicKey;

    const feePercentage = new anchor.BN(1000); // 1%
    const eventDescription = "Test Event with Voucher Bet";
    const startTime = Math.floor(Date.now() / 1000) + 5;
    const deadline = Math.floor(Date.now() / 1000) + 8;
    const possibleOutcomes = ["Outcome 1", "Outcome 2"];
    const voucherAmount = new anchor.BN(20000);
    const winningOutcome = "Outcome 1";
    const betAmount = new anchor.BN(5000);

    // Helper function to create Associated Token Account if it doesn't exist
    async function createATAIfNotExist(
        ataPublicKey: PublicKey,
        mint: PublicKey,
        owner: PublicKey,
        payer: Keypair
    ) {
        try {
            await getTokenAccount(connection, ataPublicKey);
            console.log("Token account exists:", ataPublicKey.toBase58());
        } catch (error) {
            console.log("Creating token account:", ataPublicKey.toBase58());
            const ix = createAssociatedTokenAccountInstruction(
                payer.publicKey,
                ataPublicKey,
                owner,
                mint
            );
            const tx = new Transaction().add(ix);
            await anchor.web3.sendAndConfirmTransaction(
                connection,
                tx,
                [payer],
                { commitment: "confirmed" }
            );
        }
    }

    before(async () => {
        // Initialize keypairs
        owner = Keypair.generate();
        user = Keypair.generate();
        programAuthority = Keypair.generate();

        // Airdrop SOL
        await Promise.all([
            connection.requestAirdrop(owner.publicKey, 100 * anchor.web3.LAMPORTS_PER_SOL),
            connection.requestAirdrop(user.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL),
        ]).then(signatures => Promise.all(signatures.map(sig => provider.connection.confirmTransaction(sig))));

        // Derive PDAs
        [programStatePDA] = await PublicKey.findProgramAddress(
            [Buffer.from("program_state")],
            program.programId
        );

        [programAuthorityPDAAccount] = await PublicKey.findProgramAddress(
            [Buffer.from("program_authority")],
            program.programId
        );

        [feePoolPDA] = await PublicKey.findProgramAddress(
            [Buffer.from("program_state"), Buffer.from("fee_pool")],
            program.programId
        );

        // Create token mint
        tokenMint = await createMint(
            connection,
            owner,
            owner.publicKey,
            null,
            9,
        );

        // Create token accounts
        ownerTokenAccount = await getAssociatedTokenAddress(tokenMint, owner.publicKey);
        userTokenAccount = await getAssociatedTokenAddress(tokenMint, user.publicKey);

        console.log("\nFee Pool Setup:");
        console.log("Fee Pool PDA:", feePoolPDA.toBase58());

        // Initialize program
        await program.methods.initialize(feePercentage, programAuthority.publicKey)
            .accounts({
                programAuthority: programAuthorityPDAAccount,
                programState: programStatePDA,
                owner: owner.publicKey,
                systemProgram: SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            })
            .signers([owner])
            .rpc();

        // Create token accounts
        await createATAIfNotExist(ownerTokenAccount, tokenMint, owner.publicKey, owner);
        await createATAIfNotExist(userTokenAccount, tokenMint, user.publicKey, owner);

        // Mint tokens
        await mintTo(connection, owner, tokenMint, ownerTokenAccount, owner, 1000000000);
        await mintTo(connection, owner, tokenMint, userTokenAccount, owner, 1000000000); // Add tokens for user

        // Initialize fee pool
        await program.methods.initializeFeePool()
            .accounts({
                feePool: feePoolPDA, // Use feePoolPDA (the PDA address)
                authority: owner.publicKey,
                programState: programStatePDA,
                programAuthority: programAuthorityPDAAccount,
                tokenMint: tokenMint,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                rent: SYSVAR_RENT_PUBKEY,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            })
            .signers([owner])
            .rpc();

        // Log balances before adding voucher funds
        const beforeVoucherAccount = await getTokenAccount(connection, ownerTokenAccount);
        const beforeFeePoolAccount = await getTokenAccount(connection, feePoolPDA);
        console.log("\nBalances before adding voucher funds:");
        console.log("Owner token account:", beforeVoucherAccount.amount.toString());
        console.log("Fee pool token account:", beforeFeePoolAccount.amount.toString());

        const additionalVoucherFunds = new anchor.BN(50000);
        // Add voucher funds with corrected account structure
        await program.methods.addVoucherFunds(additionalVoucherFunds)
            .accounts({
                programState: programStatePDA,
                userTokenAccount: ownerTokenAccount,
                feePool: feePoolPDA, // Pass the PDA directly instead of feePoolTokenAccount
                fundSource: owner.publicKey,
                tokenMint: tokenMint,
                tokenProgram: TOKEN_PROGRAM_ID,
                programAuthority: programAuthorityPDAAccount,
            })
            .signers([owner])
            .rpc();

        // Log balances after adding voucher funds
        const afterVoucherAccount = await getTokenAccount(connection, ownerTokenAccount);
        const afterFeePoolAccount = await getTokenAccount(connection, feePoolPDA);
        console.log("\nBalances after adding voucher funds:");
        console.log("Owner token account:", afterVoucherAccount.amount.toString());
        console.log("Fee pool token account:", afterFeePoolAccount.amount.toString());
        console.log("Amount moved:", additionalVoucherFunds.toString());

        // Verify the transfer
        const ownerDiff = new anchor.BN(beforeVoucherAccount.amount.toString())
            .sub(new anchor.BN(afterVoucherAccount.amount.toString()));
        const feePoolDiff = new anchor.BN(afterFeePoolAccount.amount.toString())
            .sub(new anchor.BN(beforeFeePoolAccount.amount.toString()));
        
        console.log("\nTransfer verification:");
        console.log("Amount deducted from owner:", ownerDiff.toString());
        console.log("Amount added to fee pool:", feePoolDiff.toString());

        let nextEventId = (await program.account.programState.fetch(programStatePDA)).nextEventId;
        let [_eventPDA, _eventBump] = await PublicKey.findProgramAddress(
            [Buffer.from(anchor.utils.bytes.utf8.encode("event")), nextEventId.toArrayLike(Buffer, "le", 8)],
            program.programId
        );
        eventPDA = _eventPDA;

        let now = Math.floor(Date.now() / 1000);
        await program.methods.createEvent(eventDescription, new anchor.BN(now), new anchor.BN(now + 4), possibleOutcomes, voucherAmount)
            .accounts({
                programState: programStatePDA,
                event: eventPDA,
                owner: owner.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([owner])
            .rpc();

        // In the 'before' hook after creating the event:
        let programStateAfterCreate = await program.account.programState.fetch(programStatePDA);
        let actualEventId = programStateAfterCreate.nextEventId.sub(new anchor.BN(1)); // Get actualEventId as BN

        // Derive event PDA with correct ID by assigning to the existing variable
        [eventPDA] = await PublicKey.findProgramAddress(
            [Buffer.from("event"), actualEventId.toArrayLike(Buffer, "le", 8)],
            program.programId
        );

        // Derive event pool PDA with correct event ID by assigning to the existing variable
        const eventPoolPDA_Result_ACTUAL_EVENT = await PublicKey.findProgramAddress(
            [
                Buffer.from("event"),
                actualEventId.toArrayLike(Buffer, "le", 8),
                Buffer.from("pool")
            ],
            program.programId
        );
        eventPoolPDA = eventPoolPDA_Result_ACTUAL_EVENT[0];
        eventPoolTokenAccount_EVENT = eventPoolPDA;

        let initEventPoolTx = await program.methods.initializeEventPool()
            .accounts({
                event: eventPDA,
                eventPool: eventPoolPDA,
                eventPoolTokenAccount: eventPoolTokenAccount_EVENT, // Use eventPoolTokenAccount_EVENT
                payer: owner.publicKey,
                tokenMint: tokenMint,
                systemProgram: SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
                rent: SYSVAR_RENT_PUBKEY,
            })
            .signers([owner])
            .rpc();
        await connection.confirmTransaction(initEventPoolTx);

        const USER_BET_SEED = Buffer.from(anchor.utils.bytes.utf8.encode("user_bet"));
        const userBetSeedBuffer = USER_BET_SEED;
        const userBetPublicKeyBytes = user.publicKey.toBytes();
        const eventIdBuffer = actualEventId.toArrayLike(Buffer, 'le', 8);
        const [_userBetPDA, _userBetBumpA] = await PublicKey.findProgramAddress(
            [userBetSeedBuffer, userBetPublicKeyBytes, eventIdBuffer],
            program.programId
        );
        userBetPDA = _userBetPDA;

        await program.methods.initializeUserBet()
            .accounts({
                userBet: userBetPDA,
                event: eventPDA,
                user: user.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([user])
            .rpc();

        // Update UserBet PDAs with correct event ID - Not needed in 'before' hook for this test setup, can be in 'it' if needed for dynamic event IDs in future tests.
        const [_userBetPDA_updated, _userBetBump_updated] = await PublicKey.findProgramAddress(
            [Buffer.from(anchor.utils.bytes.utf8.encode("user_bet")), user.publicKey.toBytes(), nextEventId.toArrayLike(Buffer, "le", 8)],
            program.programId
        );
        userBetPDA = _userBetPDA_updated;
    });

    it("Should place bet with voucher amount successfully", async () => {
        const eventIdForBet = (await program.account.programState.fetch(programStatePDA)).nextEventId.sub(new anchor.BN(1));
        const vouchAmountForBet = new anchor.BN(10000);
        const nonceForBet = 0;

        const outcomeIndex = 0;
        const outcomeStr = possibleOutcomes[outcomeIndex];

        const placeBetTx = await program.methods.placeBetWithVoucher(
            outcomeStr,
            betAmount,
            vouchAmountForBet,
            new anchor.BN(nonceForBet),
        ).accounts({
            programState: programStatePDA,
            adminSigner: programAuthority.publicKey,
            event: eventPDA,
            userBet: userBetPDA,
            userTokenAccount: userTokenAccount,
            eventPool: eventPoolPDA,
            feePool: feePoolPDA, // Pass the PDA here as well
            programAuthority: programAuthorityPDAAccount,
            user: user.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            ed25519Program: anchor.web3.Ed25519Program.programId,
        })
        .signers([user, programAuthority])
        .rpc();
        await connection.confirmTransaction(placeBetTx);

        // Assertions - Verify account states
        const userBetAccountAfterBet = await program.account.userBet.fetch(userBetPDA);
        assert.isTrue(userBetAccountAfterBet.amount.eq(betAmount.add(vouchAmountForBet)), "User bet amount should be updated");
        assert.strictEqual(userBetAccountAfterBet.outcome, outcomeStr, "User bet outcome should be correct");
        assert.isTrue(userBetAccountAfterBet.nonce.eq(new anchor.BN(nonceForBet + 1)), "User bet nonce should be incremented");

        const eventAccountAfterBet = await program.account.event.fetch(eventPDA);
        assert.isTrue(eventAccountAfterBet.totalPool.eq(betAmount.add(vouchAmountForBet)), "Event total pool should increase");
        assert.isTrue(eventAccountAfterBet.totalVoucherClaimed.eq(vouchAmountForBet), "Event total voucher claimed should increase");
        assert.isTrue(eventAccountAfterBet.totalBetsByOutcome[outcomeIndex].eq(betAmount.add(vouchAmountForBet)), "Event outcome bet amount should increase");

        const additionalVoucherFunds = new anchor.BN(50000);
        const feePoolAccountAfterBet = await getTokenAccount(connection, feePoolPDA);
        const feePoolExpectedBalance = additionalVoucherFunds.sub(vouchAmountForBet);
        assert.isTrue(new anchor.BN(feePoolAccountAfterBet.amount.toString()).eq(feePoolExpectedBalance), "Fee pool token account balance should decrease by vouched amount");
    });

    it("Should allow a different user to place bet with voucher amount on a different outcome", async () => {
        // Generate a new user and fund it
        const newUser = anchor.web3.Keypair.generate();
        await connection.requestAirdrop(newUser.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
        
        // Create new user's token account and fund it with tokens
        const newUserTokenAccount = await getAssociatedTokenAddress(tokenMint, newUser.publicKey);
        try {
            await getTokenAccount(connection, newUserTokenAccount);
        } catch {
            const ix = createAssociatedTokenAccountInstruction(
                owner.publicKey,
                newUserTokenAccount,
                newUser.publicKey,
                tokenMint
            );
            const tx = new Transaction().add(ix);
            await anchor.web3.sendAndConfirmTransaction(connection, tx, [owner], { commitment: "confirmed" });
        }
        await mintTo(connection, owner, tokenMint, newUserTokenAccount, owner, 1000000000);
        
        // Use "Outcome 2" for this new user
        const outcomeStr = possibleOutcomes[1];
        const newVouchAmount = new anchor.BN(8000);  // voucher amount
        const additionalBetAmount = new anchor.BN(3000);
        const newNonce = 0;

        // Fetch event account and convert event.id to 8-byte little-endian buffer
        const eventAccount = await program.account.event.fetch(eventPDA);
        const eventIdBuffer = eventAccount.id.toArrayLike(Buffer, "le", 8);
        // Derive new user's bet PDA with correct seed
        const [newUserBetPDA] = await PublicKey.findProgramAddress(
            [Buffer.from("user_bet"), newUser.publicKey.toBuffer(), eventIdBuffer],
            program.programId
        );

        // Initialize new user's bet account
        await program.methods.initializeUserBet().accounts({
            userBet: newUserBetPDA,
            event: eventPDA,
            user: newUser.publicKey,
            systemProgram: SystemProgram.programId,
        }).signers([newUser]).rpc();

        // Place bet with voucher from new user on "Outcome 2"
        const tx = await program.methods.placeBetWithVoucher(
            outcomeStr,
            additionalBetAmount,
            newVouchAmount,
            new anchor.BN(newNonce)
        ).accounts({
            programState: programStatePDA,
            adminSigner: programAuthority.publicKey,
            event: eventPDA,
            userBet: newUserBetPDA,
            userTokenAccount: newUserTokenAccount,
            eventPool: eventPoolPDA,
            feePool: feePoolPDA, // PDA used throughout your program
            programAuthority: programAuthorityPDAAccount,
            user: newUser.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            ed25519Program: anchor.web3.Ed25519Program.programId,
        })
        .signers([newUser, programAuthority])
        .rpc();
        await connection.confirmTransaction(tx);

        // Verify new user's bet account updated
        const newUserBetAccount = await program.account.userBet.fetch(newUserBetPDA);
        assert.isTrue(newUserBetAccount.amount.eq(additionalBetAmount.add(newVouchAmount)), "New user's bet amount should be updated");
        assert.strictEqual(newUserBetAccount.outcome, outcomeStr, "New user's bet outcome should be correct");
        assert.isTrue(newUserBetAccount.nonce.eq(new anchor.BN(newNonce + 1)), "New user's bet nonce should be incremented");

        // Also, verify event state reflects additional voucher bet on outcome index 1
        const eventAccountAfterBet = await program.account.event.fetch(eventPDA);
        const outcomeIndex = possibleOutcomes.indexOf(outcomeStr);
        assert.isTrue(eventAccountAfterBet.totalBetsByOutcome[outcomeIndex].eq(additionalBetAmount.add(newVouchAmount)), "Event outcome bet amount should update for Outcome 2");
    });

    it("Should place bet without voucher amount successfully", async () => {
        const betAmt = new anchor.BN(7000);
        // Fetch initial user bet balance and event total pool
        const initialUserBet = await program.account.userBet.fetch(userBetPDA);
        const initialUserBetAmount = initialUserBet.amount;
        const initialEventAccount = await program.account.event.fetch(eventPDA);
        const initialEventPool = initialEventAccount.totalPool;
        
        // Place bet (no voucher) on the existing event
        const tx = await program.methods.placeBet(
            possibleOutcomes[0],
            betAmt
        ).accounts({
            event: eventPDA,
            userBet: userBetPDA,
            userTokenAccount: userTokenAccount,
            eventPool: eventPoolPDA,
            user: user.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();
        await connection.confirmTransaction(tx);
        
        // Verify the user bet amount has increased by betAmt
        const userBetAccountAfterBet = await program.account.userBet.fetch(userBetPDA);
        assert.isTrue(userBetAccountAfterBet.amount.eq(initialUserBetAmount.add(betAmt)), "User bet amount should equal initial + bet amount");
        
        // Verify that the event total pool increased by betAmt (adding to the initial pool)
        const eventAccountAfterBet = await program.account.event.fetch(eventPDA);
        assert.isTrue(eventAccountAfterBet.totalPool.eq(initialEventPool.add(betAmt)), "Event total pool should increase by bet amount");
    });

    it("Should resolve already created event successfully", async () => {
        // Use the already created event (eventPDA) from before hook
        let currentEvent = await program.account.event.fetch(eventPDA);
        const now = Math.floor(Date.now() / 1000);
        const waitDuration = currentEvent.deadline - now;
        //if (waitDuration > 0) {
          console.log(`Waiting for ${waitDuration + 3} seconds for deadline to pass`);
          await new Promise(resolve => setTimeout(resolve, (waitDuration + 3) * 1000));
        //}
        // Refresh event
        currentEvent = await program.account.event.fetch(eventPDA);
        // Now resolve the event with the winning outcome "Outcome 1"
        await program.methods.resolveEvent("Outcome 1").accounts({
            programState: programStatePDA, // changed key from program_state to programState
            event: eventPDA,
            program_authority: programAuthorityPDAAccount,
            event_pool: eventPoolPDA,
            fee_pool: feePoolPDA,
            tokenMint: tokenMint, // use tokenMint (camelCase)
            token_program: TOKEN_PROGRAM_ID,
            owner: owner.publicKey,
        })
        .signers([owner])
        .rpc();
        const resolvedEvent = await program.account.event.fetch(eventPDA);
        assert.equal(resolvedEvent.winningOutcome, "Outcome 1", "Winning outcome mismatch");
        assert.isTrue(resolvedEvent.resolved, "Event should be marked as resolved");
    });

    it("Should claim winnings successfully", async () => {
        // Before calculating payout, ensure event is resolved.
        let eventAccount = await program.account.event.fetch(eventPDA);
        // if (!eventAccount.resolved) {
        //     const now = Math.floor(Date.now() / 1000);
        //     const waitDuration = eventAccount.deadline - now;
        //     if (waitDuration > 0) {
        //       console.log(`Waiting for ${waitDuration + 3} seconds before resolving for claim`);
        //       await new Promise(resolve => setTimeout(resolve, (waitDuration + 3) * 1000));
        //     }
        //     // Resolve event if not already resolved.
        //     await program.methods.resolveEvent("Outcome 1").accounts({
        //         programState: programStatePDA,
        //         event: eventPDA,
        //         program_authority: programAuthorityPDAAccount,
        //         event_pool: eventPoolPDA,
        //         fee_pool: feePoolPDA,
        //         tokenMint: tokenMint,
        //         token_program: TOKEN_PROGRAM_ID,
        //         owner: owner.publicKey,
        //     })
        //     .signers([owner])
        //     .rpc();
        //     eventAccount = await program.account.event.fetch(eventPDA);
        // }

        // Get user's token balance before claim
        const beforeBalance = new anchor.BN((await getTokenAccount(connection, userTokenAccount)).amount.toString());
        const userBetAccount = await program.account.userBet.fetch(userBetPDA);
        
        // Calculate expected payout using current state
        const winningIndex = eventAccount.possibleOutcomes.findIndex((o: string) => o === eventAccount.winningOutcome);
        // Ensure winning outcome found
        assert.isTrue(winningIndex !== -1, "Winning outcome not found among possible outcomes");
        const totalWinningBets = new anchor.BN(eventAccount.totalBetsByOutcome[winningIndex].toString());
        const totalPoolAfterFees = new anchor.BN(eventAccount.totalPool.toString());
        const expectedPayout = totalPoolAfterFees.mul(new anchor.BN(userBetAccount.amount.toString())).div(totalWinningBets);
        
        // Call claimWinnings
        await program.methods.claimWinnings()
          .accounts({
              event: eventPDA,
              userBet: userBetPDA,
              userTokenAccount: userTokenAccount,
              eventPool: eventPoolPDA,
              user: user.publicKey,
              tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([user])
          .rpc();
        
        const updatedUserBet = await program.account.userBet.fetch(userBetPDA);
        const afterBalance = new anchor.BN((await getTokenAccount(connection, userTokenAccount)).amount.toString());
        const actualPayout = afterBalance.sub(beforeBalance);
        assert.equal(updatedUserBet.amount, 0, "User bet amount should reset to zero");
        assert.isTrue(actualPayout.eq(expectedPayout), "Payout should equal expected payout");
    });

    it("Should add voucher funds and then withdraw fees successfully", async () => {
        // Get initial balances
        const feePoolBalanceBefore = new anchor.BN((await getTokenAccount(connection, feePoolPDA)).amount.toString());
        const ownerBalanceBefore = new anchor.BN((await getTokenAccount(connection, ownerTokenAccount)).amount.toString());

        // Define the voucher funds to add
        const voucherAddition = new anchor.BN(1500);
        
        // Add voucher funds (this increases accumulated fees and transfers tokens from owner to fee pool)
        await program.methods.addVoucherFunds(voucherAddition)
          .accounts({
              programState: programStatePDA,
              userTokenAccount: ownerTokenAccount,
              feePool: feePoolPDA,
              fundSource: owner.publicKey,
              tokenMint: tokenMint,
              tokenProgram: TOKEN_PROGRAM_ID,
              programAuthority: programAuthorityPDAAccount,
          })
          .signers([owner])
          .rpc();

        // Verify fee pool balance increased by voucherAddition
        const feePoolBalanceAfterVoucher = new anchor.BN((await getTokenAccount(connection, feePoolPDA)).amount.toString());
        assert.isTrue(feePoolBalanceAfterVoucher.eq(feePoolBalanceBefore.add(voucherAddition)), "Fee pool should increase by the voucher amount");

        // Now withdraw a portion of the fees
        const withdrawalAmount = new anchor.BN(10000);
        const ownerBalanceBeforeWithdraw = new anchor.BN((await getTokenAccount(connection, ownerTokenAccount)).amount.toString());
        await program.methods.withdrawFees(withdrawalAmount)
          .accounts({
              programState: programStatePDA,
              feePool: feePoolPDA,
              ownerTokenAccount: ownerTokenAccount,
              owner: owner.publicKey,
              program_authority: programAuthorityPDAAccount,
              token_program: TOKEN_PROGRAM_ID,
              system_program: SystemProgram.programId,
              rent: SYSVAR_RENT_PUBKEY,
              clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          })
          .signers([owner])
          .rpc();

        // Check final balances
        const feePoolBalanceAfterWithdraw = new anchor.BN((await getTokenAccount(connection, feePoolPDA)).amount.toString());
        const ownerBalanceAfterWithdraw = new anchor.BN((await getTokenAccount(connection, ownerTokenAccount)).amount.toString());
        assert.isTrue(feePoolBalanceAfterWithdraw.eq(feePoolBalanceAfterVoucher.sub(withdrawalAmount)), "Fee pool must decrease by the withdrawal amount");
        assert.isTrue(ownerBalanceAfterWithdraw.eq(ownerBalanceBeforeWithdraw.add(withdrawalAmount)), "Owner's token account must increase by the withdrawal amount");
    });

    it("Should update voucher amount successfully", async () => {
        // Create a new event specifically for voucher update (ensure it is not resolved)
        const now = Math.floor(Date.now() / 1000);
        const testEventDescription = "Voucher Update Test Event";
        const testEventStartTime = now + 10;  // 10 seconds in future
        const testEventDeadline = now + 30;   // deadline in 30 seconds
        const testPossibleOutcomes = ["Outcome 1", "Outcome 2"];
        const testInitialVoucher = new anchor.BN(20000);
        console.log("Creating new event for voucher update test");
        // Derive new event PDA from current program state using correct property name
        let programStateAfterCreate = await program.account.programState.fetch(programStatePDA);
        const testEventId = programStateAfterCreate.nextEventId; // Changed from next_event_id to nextEventId
        let [testEventPDA] = await PublicKey.findProgramAddress(
             [Buffer.from("event"), testEventId.toArrayLike(Buffer, "le", 8)],
             program.programId
        );
        console.log("New event ID:", testEventId.toString());
        // Create the new event
        await program.methods.createEvent(
             testEventDescription,
             new anchor.BN(testEventStartTime),
             new anchor.BN(testEventDeadline),
             testPossibleOutcomes,
             testInitialVoucher
        ).accounts({
             programState: programStatePDA,
             event: testEventPDA,
             owner: owner.publicKey,
             systemProgram: SystemProgram.programId,
        }).signers([owner]).rpc();
        console.log("New event created:", testEventPDA.toBase58());
        // Fetch the new event and confirm it's not resolved
        let testEventAccount = await program.account.event.fetch(testEventPDA);
        

        // Store initial voucher and active vouchers from program state
        const initialVoucher = new anchor.BN(testEventAccount.voucherAmount.toString());
        const programStateBefore = await program.account.programState.fetch(programStatePDA);
        const initialActiveVouchers = new anchor.BN(programStateBefore.activeVouchersAmount.toString());

        // ----- Increase scenario -----
        const increaseAmt = new anchor.BN(500);
        const newVoucherIncrease = initialVoucher.add(increaseAmt);

        // Pass the BN instance directly (remove .toNumber())
        await program.methods.updateVoucherAmount(newVoucherIncrease)
               .accounts({
                   programState: programStatePDA,
                   event: testEventPDA,
                   owner: owner.publicKey,
               })
               .signers([owner])
               .rpc();
               console.log("Voucher increased to:", newVoucherIncrease.toString());
        testEventAccount = await program.account.event.fetch(testEventPDA);
        const programStateAfterIncrease = await program.account.programState.fetch(programStatePDA);

        assert.isTrue(testEventAccount.voucherAmount.eq(newVoucherIncrease), "Event voucher amount should be updated (increased)");
        const expectedActiveAfterIncrease = initialActiveVouchers.add(increaseAmt);
        assert.isTrue(new anchor.BN(programStateAfterIncrease.activeVouchersAmount.toString()).eq(expectedActiveAfterIncrease),
          "Program active vouchers should increase by the difference");

        const decreaseAmt = new anchor.BN(200);
        const newVoucherDecrease = newVoucherIncrease.sub(decreaseAmt);
        const activeBeforeDecrease = new anchor.BN(programStateAfterIncrease.activeVouchersAmount.toString());

        // Similarly, pass the decreased voucher amount as a number
        await program.methods.updateVoucherAmount(newVoucherDecrease)
               .accounts({
                   programState: programStatePDA,
                   event: testEventPDA,
                   owner: owner.publicKey,
               })
               .signers([owner])
               .rpc();
               console.log("Voucher decreased to:", newVoucherDecrease.toString());
        testEventAccount = await program.account.event.fetch(testEventPDA);
        const programStateAfterDecrease = await program.account.programState.fetch(programStatePDA);

        assert.isTrue(testEventAccount.voucherAmount.eq(newVoucherDecrease), "Event voucher amount should be updated (decreased)");
        const expectedActiveAfterDecrease = activeBeforeDecrease.sub(decreaseAmt);
        assert.isTrue(new anchor.BN(programStateAfterDecrease.activeVouchersAmount.toString()).eq(expectedActiveAfterDecrease),
          "Program active vouchers should decrease by the difference");
    });
    
});