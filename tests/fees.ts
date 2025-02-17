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
import { PublicKey, SystemProgram, Transaction, Keypair, Connection, Provider } from "@solana/web3.js";

describe("event-betting extended tests: resolve_event, claim_winnings, withdraw_fees", () => {
    // Configure the client to use the local cluster.
    anchor.setProvider(anchor.AnchorProvider.env());
    //provider.payer = owner;
    const program = anchor.workspace.EventBetting as Program<EventBetting>;
    const provider = anchor.getProvider() as anchor.AnchorProvider;
    const connection = provider.connection;

    // Accounts - Reused and some new ones
    let owner: Keypair;
    let user: Keypair;
    let user2: Keypair; // For multiple users betting
    let programAuthority: Keypair;
    let eventAuthority: Keypair;

    let programStatePDA: PublicKey;
    let eventPDA: PublicKey;
    let eventPoolPDA: PublicKey;
    let feePoolPDA: PublicKey;
    let programAuthorityPDAAccount: PublicKey;

    let tokenMint: PublicKey;
    let ownerTokenAccount: PublicKey;
    let feePoolTokenAccount: PublicKey;
    let eventPoolTokenAccount: PublicKey;
    let userTokenAccount: PublicKey;
    let user2TokenAccount: PublicKey;
    let userBetPDA: PublicKey;
    let user2BetPDA: PublicKey;
    let userAccountPDA: PublicKey; // User PDA account
    let user2AccountPDA: PublicKey; // User2 PDA account
    //provider.payer = owner;

    const feePercentage = new anchor.BN(1000); // 2%
    const eventDescription = "Test Event Description for Resolve/Claim/Withdraw";
    const startTime = Math.floor(Date.now() / 1000) + 5; // Event starts in 5 seconds
    const deadline = Math.floor(Date.now() / 1000) + 8;
    const possibleOutcomes = ["Outcome 1", "Outcome 2"];
    const voucherAmount = new anchor.BN(10000);
    const winningOutcome = "Outcome 1";
    const betAmount = new anchor.BN(100000); // Bet amount for placing bets

    before(async () => {
        owner = Keypair.generate();
        user = Keypair.generate();
        user2 = Keypair.generate(); // Generate user2 keypair
        programAuthority = Keypair.generate();
        eventAuthority = Keypair.generate();

        // Set provider payer to owner before airdrop and other operations
        //provider.payer = owner;

        // Airdrop SOL to owner and users - INCREASED AMOUNT

        await Promise.all([
            connection.requestAirdrop(owner.publicKey, 100 * anchor.web3.LAMPORTS_PER_SOL),
            connection.requestAirdrop(user.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL), // Airdrop to user
            connection.requestAirdrop(user2.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL), // Airdrop to user2
            connection.requestAirdrop(provider.wallet.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
        ]).then(signatures => Promise.all(signatures.map(sig => provider.connection.confirmTransaction(sig))));


        // **IMMEDIATE BALANCE CHECK AFTER AIRDROP - for all keypairs
        let ownerBalanceAfterAirdrop = await connection.getBalance(owner.publicKey);
        let userBalanceAfterAirdrop = await connection.getBalance(user.publicKey);
        let user2BalanceAfterAirdrop = await connection.getBalance(user2.publicKey);



        // Derive PDAs
        const [_programStatePDA, _programStateBump] = await PublicKey.findProgramAddress(
            [Buffer.from(anchor.utils.bytes.utf8.encode("program_state"))],
            program.programId
        );
        programStatePDA = _programStatePDA;

        const [_programAuthorityPDAAccount, _programAuthorityBump] = await PublicKey.findProgramAddress(
            [Buffer.from(anchor.utils.bytes.utf8.encode("program_authority"))],
            program.programId
        );
        programAuthorityPDAAccount = _programAuthorityPDAAccount;

        console.log("Program Authority Public Key:", programAuthority.publicKey.toBase58());
        console.log("Program Authority PDA Account:", programAuthorityPDAAccount.toBase58());


        tokenMint = await createMint(
            connection,
            owner,
            owner.publicKey,
            null,
            9,
        );


        ownerTokenAccount = await getAssociatedTokenAddress(
            tokenMint,
            owner.publicKey,
        );

        feePoolPDA = await PublicKey.findProgramAddress( // Use findProgramAddress
            [Buffer.from(anchor.utils.bytes.utf8.encode("program_state")), Buffer.from(anchor.utils.bytes.utf8.encode("fee_pool"))],
            program.programId
        );
        console.log("Fee Pool PDA:", feePoolPDA[0].toBase58());
        feePoolTokenAccount = await getAssociatedTokenAddress(
            tokenMint,
            feePoolPDA[0], // Access the PublicKey from the result of findProgramAddress
            true
        );
        // Event Pool PDA - Event ID 0 for setup
        eventPoolPDA = await PublicKey.findProgramAddress(
            [Buffer.from(anchor.utils.bytes.utf8.encode("event")), new anchor.BN(0).toArrayLike(Buffer, "le", 8), Buffer.from(anchor.utils.bytes.utf8.encode("pool"))],
            program.programId
        );

        // Correct: Event Pool Token Account is now just the Event Pool PDA itself
        eventPoolTokenAccount = eventPoolPDA[0]; // <---- Corrected: Use eventPoolPDA[0] directly
        console.log("Event Pool Token Account (now PDA):", eventPoolTokenAccount.toBase58());


        userTokenAccount = await getAssociatedTokenAddress(
            tokenMint,
            user.publicKey,
        );

        user2TokenAccount = await getAssociatedTokenAddress(
            tokenMint,
            user2.publicKey,
        );


        // User Account PDA
        const [_userAccountPDA, _userAccountBump] = await PublicKey.findProgramAddress(
            [Buffer.from(anchor.utils.bytes.utf8.encode("user")), user.publicKey.toBytes()],
            program.programId
        );


        userAccountPDA = _userAccountPDA;
        async function createATAIfNotExist(ataPublicKey, mint, ownerPublicKey, payerKeypair) {
            try {
                await getTokenAccount(connection, ataPublicKey);
            } catch (error) {

                const createAtaIx = createAssociatedTokenAccountInstruction(
                    payerKeypair.publicKey,
                    ataPublicKey,
                    ownerPublicKey,
                    mint,
                    TOKEN_PROGRAM_ID,
                    anchor.web3.TOKEN_2022_PROGRAM_ID
                );
                const tx = new Transaction().add(createAtaIx);

                try {
                    const txSig = await anchor.web3.sendAndConfirmTransaction( // <---- Capture txSig
                        connection,
                        tx,
                        [payerKeypair],
                        { commitment: "confirmed" }
                    );
                    const ataAccount = await getTokenAccount(connection, ataPublicKey);

                } catch (sendError) {
                    //console.error("Error creating ATA:", ataPublicKey.toBase58());
                    console.error(sendError);
                }
            }
        }
        await createATAIfNotExist(feePoolTokenAccount, tokenMint, feePoolPDA[0], owner); // payer=owner
        //await createATAIfNotExist(eventPoolTokenAccount, tokenMint, eventPoolPDA[0], owner); // Removed - eventPoolTokenAccount is not ATA anymore
        await createATAIfNotExist(ownerTokenAccount, tokenMint, owner.publicKey, owner); // payer=owner
        await createATAIfNotExist(userTokenAccount, tokenMint, user.publicKey, owner); // payer=owner
        await createATAIfNotExist(user2TokenAccount, tokenMint, user2.publicKey, owner); // payer=owner
        console.log("Token accounts created.");
        // Mint tokens to owner and user accounts
        await mintTo(connection, owner, tokenMint, ownerTokenAccount, owner, 1000000000);
        await mintTo(connection, owner, tokenMint, userTokenAccount, owner, 10000000000); // Mint to user
        await mintTo(connection, owner, tokenMint, user2TokenAccount, owner, 10000000000); // Mint to user2
        console.log("Tokens minted to accounts.");
        await program.methods.initialize(feePercentage, owner.publicKey)
            .accounts({
                programAuthority: programAuthorityPDAAccount,
                programState: programStatePDA,
                owner: owner.publicKey,
                systemProgram: SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            })
            .signers([owner])
            .rpc({ commitment: "confirmed" }); // ADDED: Explicit commitment
            console.log("Program initialized.");
        await program.methods.initializeFeePool()
            .accounts({
                feePool: feePoolPDA[0],
                authority: owner.publicKey,
                programState: programStatePDA,
                programAuthority: programAuthorityPDAAccount,
                tokenMint: tokenMint,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            })
            .signers([owner])
            .rpc({ commitment: "confirmed" }); // ADDED: Explicit commitment
        console.log("Fee Pool initialized.");    
        let nextEventId = (await program.account.programState.fetch(programStatePDA)).nextEventId;
        let [_eventPDA, _eventBump] = await PublicKey.findProgramAddress(
            [Buffer.from(anchor.utils.bytes.utf8.encode("event")), nextEventId.toArrayLike(Buffer, "le", 8)],
            program.programId
        );
        eventPDA = _eventPDA;
        let now = Math.floor(Date.now() / 1000);
        await program.methods.createEvent(eventDescription, new anchor.BN(now + 1), new anchor.BN(now + 4), possibleOutcomes, new anchor.BN(0))
            .accounts({
                programState: programStatePDA,
                event: eventPDA,
                owner: owner.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([owner])
            .rpc({ commitment: "confirmed" }); // ADDED: Explicit commitment
            console.log("Event created.");
        // In the 'before' hook after creating the event:
        let programStateAfterCreate = await program.account.programState.fetch(programStatePDA);
        let actualEventId = programStateAfterCreate.nextEventId - 1; // Since nextEventId was incremented

        // Derive event PDA with correct ID by assigning to the existing variable
        [eventPDA] = await PublicKey.findProgramAddress(
            [Buffer.from("event"), new anchor.BN(actualEventId).toArrayLike(Buffer, "le", 8)],
            program.programId
        );

        // Derive event pool PDA with correct event ID by assigning to the existing variable
        [eventPoolPDA] = await PublicKey.findProgramAddress(
            [
                Buffer.from("event"),
                new anchor.BN(actualEventId).toArrayLike(Buffer, "le", 8),
                Buffer.from("pool")
            ],
            program.programId
        );
        eventPoolTokenAccount = eventPoolPDA[0]; // <---- Corrected: Use eventPoolPDA[0] directly


        let initEventPoolTx = await program.methods.initializeEventPool()
            .accounts({
                event: eventPDA,
                eventPool: eventPoolPDA[0], // <---- Corrected: Use eventPoolPDA[0]
                eventPoolTokenAccount: eventPoolTokenAccount, // <---- Corrected: Use eventPoolTokenAccount (which is now eventPoolPDA[0])
                payer: owner.publicKey, // Owner pays for Event Pool account
                tokenMint: tokenMint,
                systemProgram: SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            })
            .signers([owner])
            .rpc({ commitment: "confirmed" }); // ADDED: Explicit commitment
        await connection.confirmTransaction(initEventPoolTx);
            console.log("Event Pool initialized.");
        //const eventPoolAccountInfoCheck = await connection.getAccountInfo(eventPoolTokenAccount);
        const event_account = await program.account.event.fetch(eventPDA);

        const USER_BET_SEED = Buffer.from(anchor.utils.bytes.utf8.encode("user_bet")); // Define USER_BET_SEED here or at top of file if not already
        const userBetSeedBuffer = USER_BET_SEED; // Use the defined USER_BET_SEED
        console.log("User Bet Seed Buffer:", userBetSeedBuffer); // ADDED LOGGING
        const userBetPublicKeyBytes = user.publicKey.toBytes();
        const eventIdBuffer = new anchor.BN(event_account.id).toArrayLike(Buffer, 'le', 8); // Get event.id from fetched account
        const [_userBetPDA, _userBetBumpA] = await PublicKey.findProgramAddress(
            [userBetSeedBuffer, userBetPublicKeyBytes, eventIdBuffer],
            program.programId
        );
        console.log("User Bet PDA:", _userBetPDA.toBase58());
        userBetPDA = _userBetPDA;
        //provider.payer = user;
        //console.log("Provider Payer Public Key BEFORE initializeUser:", provider.payer.publicKey.toBase58()); // ADDED LOGGING
        console.log("user", user.publicKey.toBase58());
        await program.methods.initializeUser()
            .accounts({
                userAccount: userAccountPDA,
                user: user.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([user]) // User is the payer and signer for user_bet init
            .rpc(); // ADDED: Explicit commitment
            console.log("User account initialized.");
        //provider.payer = user2; 


        const [_user2AccountPDA, _user2AccountBump] = await PublicKey.findProgramAddress(
            [Buffer.from(anchor.utils.bytes.utf8.encode("user")), user2.publicKey.toBytes()],
            program.programId
        );
        user2AccountPDA = _user2AccountPDA;
        await program.methods.initializeUser() // ADDED: Initialize user2 account
            .accounts({
                userAccount: user2AccountPDA,
                user: user2.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([user2])
            .rpc({ commitment: "confirmed" }); // ADDED: Explicit commitment

         //provider.payer = user; // Reset provider payer back to owner
        // console.log("Provider Payer Public Key AFTER initializeUser2:", provider.payer.publicKey.toBase58()); // ADDED LOGGING
        // console.log("User2 account initialized.");


        // User Bet PDAs (need event ID later, using 0 for setup)
        const [_userBetPDA_updated, _userBetBump_updated] = await PublicKey.findProgramAddress(
            [Buffer.from(anchor.utils.bytes.utf8.encode("user_bet")), user.publicKey.toBytes(), nextEventId.toArrayLike(Buffer, "le", 8)],
            program.programId
        );
        userBetPDA = _userBetPDA_updated;
        const [_user2BetPDA_updated, _user2BetBump_updated] = await PublicKey.findProgramAddress(
            [Buffer.from(anchor.utils.bytes.utf8.encode("user_bet")), user2.publicKey.toBytes(), nextEventId.toArrayLike(Buffer, "le", 8)],
            program.programId
        );
        user2BetPDA = _user2BetPDA_updated;
        //console.log("EventPoolTokenAccount at the END of before hook:", eventPoolPDA[0].toBase58());
    });
    it("Should place bet with voucher amount successfully", async () => {


        const additionalVoucherFunds = new anchor.BN(50000);
        await program.methods.addVoucherFunds(additionalVoucherFunds)
            .accounts({
                programState: programStatePDA,
                feePoolTokenAccount: feePoolTokenAccount,
                userTokenAccount: ownerTokenAccount, // Corrected: userTokenAccount is needed, using ownerTokenAccount as fund source
                fundSource: owner.publicKey,        // Corrected: fundSource is the signer
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([owner])                        // Corrected: owner is the signer
            .rpc({ commitment: "confirmed" }); // ADDED: Explicit commitment
        console.log("Voucher funds added.");
        // 2. Create a new event with a specific voucher amount
        let nextEventId = (await program.account.programState.fetch(programStatePDA)).nextEventId;
        let [_newEventPDA, _eventBump] = await PublicKey.findProgramAddress(
            [Buffer.from(anchor.utils.bytes.utf8.encode("event")), nextEventId.toArrayLike(Buffer, "le", 8)],
            program.programId
        );
        const newEventPDA = _newEventPDA;
        let now = Math.floor(Date.now() / 1000);
        const newEventVoucherAmount = new anchor.BN(25000);

        await program.methods.createEvent(eventDescription, new anchor.BN(now + 1), new anchor.BN(now + 4), possibleOutcomes, newEventVoucherAmount)
            .accounts({
                programState: programStatePDA,
                event: newEventPDA, // Use newEventPDA for the new event
                owner: owner.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([owner])
            .rpc({ commitment: "confirmed" }); // ADDED: Explicit commitment
        console.log("New event created with voucher amount.");
        // 1. Prepare accounts and parameters
        const eventAccount = await program.account.event.fetch(newEventPDA);
        console.log("Event Account:", eventAccount);
        console.log("program.account:", program.account); // ADDED CONSOLE LOG HERE
        const currentNonce = (await program.account.userAccount.fetch(userAccountPDA)).nonce;
        const betOutcome = possibleOutcomes[0];
        const baseBetAmount = new anchor.BN(50000);
        const voucherBetAmount = new anchor.BN(2000);

        // 2. Construct message for signing
        const programAddress = program.programId;
        const message = [
            programAddress.toBytes(),
            user.publicKey.toBytes(),
            voucherBetAmount.toBuffer("le", 8),
            currentNonce.toBuffer("le", 8),
        ];
        const messageData = Buffer.concat(message);

        // Keccak256 hashing (simulating on-chain hashing)
        const keccak256 = anchor.utils.keccak256;
        const messageHash = keccak256(messageData);
        const prefixedMessage = Buffer.concat([
            Buffer.from('\x19Ethereum Signed Message:\n' + messageHash.length.toString()),
            Buffer.from(messageHash)
        ]);
        const prefixedMessageHash = keccak256(prefixedMessage);
        const signature = await programAuthority.sign(Buffer.from(prefixedMessageHash, 'hex'));
        const signatureBytes = signature.signature;


        // 3. Fetch initial balances
        const initialUserTokenAccountBalance = await getTokenAccount(connection, userTokenAccount);
        const initialEventPoolTokenAccountBalance = await getTokenAccount(connection, eventPoolTokenAccount);
        const initialUserAccount = await program.account.userAccount.fetch(userAccountPDA);
        const initialEvent = await program.account.event.fetch(eventPDA);

        console.log("Initial User Token Account Balance:", initialUserTokenAccountBalance.amount.toString());
        console.log("Initial Event Pool Token Account Balance:", initialEventPoolTokenAccountBalance.amount.toString());
        console.log("Initial User Account Nonce:", initialUserAccount.nonce.toString());
        console.log("Initial Event total_voucher_claimed:", initialEvent.totalVoucherClaimed.toString());
        console.log("Initial accumulated_fees:", initialEvent.accumulatedFees.toString());


        // 4. Execute placeBetWithVoucher instruction
        console.log("Executing placeBetWithVoucher instruction...");
        await program.methods.placeBetWithVoucher(
            eventAccount.id,
            betOutcome,
            baseBetAmount,
            voucherBetAmount,
            currentNonce,
            Array.from(signatureBytes)
        )
            .accounts({
                event: eventPDA,
                userBet: userBetPDA,
                userTokenAccount: userTokenAccount,
                eventPool: eventPoolTokenAccount,
                user: user.publicKey,
                tokenProgram: TOKEN_PROGRAM_ID,
                programState: programStatePDA, // Add program state account
                userAccount: userAccountPDA,   // Add user account PDA
            })
            .signers([user])
            .rpc({ commitment: "confirmed" }); // ADDED: Explicit commitment

        console.log("placeBetWithVoucher instruction executed.");

        // 5. Fetch updated balances and accounts
        const updatedUserTokenAccountBalance = await getTokenAccount(connection, userTokenAccount);
        const updatedEventPoolTokenAccountBalance = await getTokenAccount(connection, eventPoolTokenAccount);
        const updatedUserAccount = await program.account.userAccount.fetch(userAccountPDA);
        const updatedUserBet = await program.account.userBet.fetch(userBetPDA);
        const updatedEvent = await program.account.event.fetch(eventPDA);


        console.log("Updated User Token Account Balance:", updatedUserTokenAccountBalance.amount.toString());
        console.log("Updated Event Pool Token Account Balance:", updatedEventPoolTokenAccountBalance.amount.toString());
        console.log("Updated User Account Nonce:", updatedUserAccount.nonce.toString());
        console.log("Updated User Bet Amount:", updatedUserBet.amount.toString());
        console.log("Updated Event total_voucher_claimed:", updatedEvent.totalVoucherClaimed.toString());
        console.log("Updated accumulated_fees:", updatedEvent.accumulatedFees.toString());


        // 6. Assertions
        assert.ok(updatedUserTokenAccountBalance.amount.eq(initialUserTokenAccountBalance.amount.sub(baseBetAmount)), "User token account balance should decrease by bet amount");
        assert.ok(updatedEventPoolTokenAccountBalance.amount.eq(initialEventPoolTokenAccountBalance.amount.add(baseBetAmount)), "Event pool token account balance should increase by bet amount");
        assert.ok(updatedUserAccount.nonce.eq(initialUserAccount.nonce.addn(1)), "User account nonce should increment");
        assert.ok(updatedUserBet.amount.eq(initialUserBet.amount.add(baseBetAmount.add(voucherBetAmount))), "User bet amount should increase by bet amount + voucher amount");
        assert.ok(updatedEvent.totalVoucherClaimed.eq(initialEvent.totalVoucherClaimed.add(voucherBetAmount)), "Event's total voucher claimed should increase by voucher amount");
        //assert.ok(updatedEvent.accumulatedFees.eq(initialEvent.accumulatedFees.sub(voucherBetAmount)), "Accumulated fees should decrease by voucher amount"); // accumulated_fees is in program state not event

    });

});