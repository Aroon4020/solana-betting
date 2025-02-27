import * as anchor from "@coral-xyz/anchor";
import { Program, web3, BN } from "@coral-xyz/anchor";
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
import {
  PublicKey,
  SystemProgram,
  Transaction,
  Keypair,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Buffer } from "buffer";

describe("Admin functions tests", () => {
  // Configure the provider to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.EventBetting as Program<EventBetting>;

  // Keypairs & PDAs
  let owner: web3.Keypair;
  let newSigner: web3.Keypair;
  let newOwner: web3.Keypair;
  let programStatePDA: web3.PublicKey;
  let programAuthorityPDA: web3.PublicKey;
  let eventPDA: web3.PublicKey;
  let eventBump: number;

  // Constants for testing
  const feePercentageInitial = new BN(1000);
  const feePercentageUpdated = new BN(2000);
  const eventDescription = "Admin Testing Event";
  const now = Math.floor(Date.now() / 1000);
  const startTime = new BN(now + 30);
  const deadline = new BN(now + 60);

  before(async () => {
    // Generate keypairs.
    owner = web3.Keypair.generate();
    newSigner = web3.Keypair.generate();
    newOwner = web3.Keypair.generate();

    // Airdrop SOL for owner.
    const airdropSig = await provider.connection.requestAirdrop(
      owner.publicKey,
      100 * web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    const airdropSig1 = await provider.connection.requestAirdrop(
        newOwner.publicKey,
        100 * web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig1);
    // Derive Program State PDA using seed "program_state".
    [programStatePDA] = await web3.PublicKey.findProgramAddress(
      [Buffer.from("program_state")],
      program.programId
    );

    // Derive Program Authority PDA using seed "program_authority".
    [programAuthorityPDA] = await web3.PublicKey.findProgramAddress(
      [Buffer.from("program_authority")],
      program.programId
    );

    // Check if program state is already initialized.
    const stateInfo = await provider.connection.getAccountInfo(programStatePDA);
    if (!stateInfo) {
      await program.methods
        .initialize(feePercentageInitial, owner.publicKey)
        .accounts({
          programAuthority: programAuthorityPDA, // correct authority PDA
          programState: programStatePDA,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([owner])
        .rpc();
      console.log("Program state initialized");
    } else {
      console.log("Program state already initialized");
    }

    // Derive an event PDA (using event ID 0 for testing).
    const eventId = new BN(0);
    const seed = eventId.toArrayLike(Buffer, "le", 8);
    [eventPDA, eventBump] = await web3.PublicKey.findProgramAddress(
      [Buffer.from("event"), seed],
      program.programId
    );

    // Create a new event to test increase_deadline and revoke_event.
    await program.methods
      .createEvent(
        eventDescription,
        startTime,
        deadline,
        ["Win", "Lose"],
        new BN(0)
      )
      .accounts({
        programState: programStatePDA,
        event: eventPDA,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();
  });

  it("should update fee percentage", async () => {
    await program.methods
      .updateFeePercentage(feePercentageUpdated)
      .accounts({
        programState: programStatePDA,
        owner: owner.publicKey,
      })
      .signers([owner])
      .rpc();

    const state: any = await program.account.programState.fetch(programStatePDA);
    assert.ok(state.feePercentage.eq(feePercentageUpdated));
  });

  it("should update signer", async () => {
    await program.methods
      .updateSigner(newSigner.publicKey)
      .accounts({
        programState: programStatePDA,
        owner: owner.publicKey,
      })
      .signers([owner])
      .rpc();

    const state: any = await program.account.programState.fetch(programStatePDA);
    assert.ok(state.signer.equals(newSigner.publicKey));
  });

  it("should update owner", async () => {
    await program.methods
      .updateOwner(newOwner.publicKey)
      .accounts({
        programState: programStatePDA,
        owner: owner.publicKey,
      })
      .signers([owner])
      .rpc();

    const state: any = await program.account.programState.fetch(programStatePDA);
    assert.ok(state.owner.equals(newOwner.publicKey));
  });

  it("should increase event deadline", async () => {
    // Use newOwner as the authorized signer now that the program state's owner was updated.
    const newDeadline = deadline.add(new BN(20));
    await program.methods
      .increaseDeadline(newDeadline)
      .accounts({
        programState: programStatePDA,
        event: eventPDA,
        owner: newOwner.publicKey, // use new owner
      })
      .signers([newOwner]) // sign with new owner
      .rpc();

    const eventAccount: any = await program.account.event.fetch(eventPDA);
    assert.ok(eventAccount.deadline.eq(newDeadline));
  });

  it("should revoke an event", async () => {
    // Use newOwner as the authorized signer.
    const nowRev = Math.floor(Date.now() / 1000);
    const startTimeRev = new BN(nowRev + 50);
    const deadlineRev = new BN(nowRev + 70);
    const eventDescriptionRev = "Revoke Test Event";

    const newEventId = new BN(1);
    const seedRev = newEventId.toArrayLike(Buffer, "le", 8);
    const [eventPDA2] = await web3.PublicKey.findProgramAddress(
      [Buffer.from("event"), seedRev],
      program.programId
    );

    await program.methods
      .createEvent(
        eventDescriptionRev,
        startTimeRev,
        deadlineRev,
        ["A", "B"],
        new BN(0)
      )
      .accounts({
        programState: programStatePDA,
        event: eventPDA2,
        owner: newOwner.publicKey, // creation can be done by the old owner if allowed
        systemProgram: SystemProgram.programId,
      })
      .signers([newOwner])
      .rpc();

    await program.methods
      .revokeEvent()
      .accounts({
        programState: programStatePDA,
        event: eventPDA2,
        owner: newOwner.publicKey, // use new owner
      })
      .signers([newOwner]) // sign with new owner
      .rpc();

    const revokedEvent: any = await program.account.event.fetch(eventPDA2);
    assert.ok(revokedEvent.voucherAmount.eq(new BN(0)));
  });
});