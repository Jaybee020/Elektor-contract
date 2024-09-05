import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import hre, { ethers } from "hardhat";
const buildPoseidon = require("circomlibjs").buildPoseidon;
const { poseidonContract } = require("circomlibjs");

describe("ZkVoting", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  let zkElection;
  let poseidon: any;
  let F: any;

  async function deployzkElectionFixture() {
    const DEPTH = 3;
    const TITLE = "Test Election";
    const MAX_VOTERS = 1000;
    const CONTESTANT_NAMES = ["Alice", "Bob", "Charlie"];

    const ONE_HOUR = 60 * 60;
    const ONE_DAY = 24 * ONE_HOUR;

    const now = await time.latest();
    const registrationStart = now + ONE_HOUR;
    const registrationEnd = registrationStart + ONE_DAY;
    const votingStart = registrationEnd + ONE_HOUR;
    const votingEnd = votingStart + ONE_DAY;

    // Contracts are deployed using the first signer/account by default
    const [owner, voter1, voter2] = await hre.ethers.getSigners();

    const MockVerifier = await hre.ethers.getContractFactory("MockVerifier");
    const mockVerifier = await MockVerifier.deploy();

    poseidon = await buildPoseidon();
    F = poseidon.F;
    const PoseidonT3 = await ethers.getContractFactory(
      poseidonContract.generateABI(2),
      poseidonContract.createCode(2)
    );
    //@ts-ignore
    const poseidonT3 = await PoseidonT3.deploy();
    const poseidonT3Addr = await poseidonT3.getAddress();

    const IncrementalBinaryTree = await hre.ethers.getContractFactory(
      "IncrementalBinaryTree",
      {
        libraries: {
          PoseidonT3: poseidonT3Addr,
        },
      }
    );
    const incrementalBinaryTree = await IncrementalBinaryTree.deploy();
    const incrementalBinaryTreeAddr = await incrementalBinaryTree.getAddress();

    const ZkElection = await hre.ethers.getContractFactory("MockZkElection", {
      libraries: {
        IncrementalBinaryTree: incrementalBinaryTreeAddr,
      },
    });

    const mockVerifierAddr = await mockVerifier.getAddress();

    const zkElection = await ZkElection.deploy(
      mockVerifierAddr,
      DEPTH,
      TITLE,
      registrationStart,
      registrationEnd,
      votingStart,
      votingEnd,
      MAX_VOTERS,
      CONTESTANT_NAMES
    );

    return {
      zkElection,
      mockVerifier,
      owner,
      voter1,
      voter2,
      registrationStart,
      registrationEnd,
      votingStart,
      votingEnd,
      CONTESTANT_NAMES,
    };
  }

  describe("Deployment", function () {
    it("Should set the correct election parameters", async function () {
      const { zkElection, CONTESTANT_NAMES } = await loadFixture(
        deployzkElectionFixture
      );
      const election = await zkElection.election();
      expect(election.title).to.equal("Test Election");
      expect(election.maxVoters).to.equal(1000);
      expect(election.currentState).to.equal(0); // ElectionState.Created

      expect(await zkElection.getContestantCount()).to.equal(
        CONTESTANT_NAMES.length
      );
    });

    it("Should set up the correct contestants", async function () {
      const { zkElection, CONTESTANT_NAMES } = await loadFixture(
        deployzkElectionFixture
      );

      for (let i = 0; i < CONTESTANT_NAMES.length; i++) {
        const contestant = await zkElection.getContestant(i);
        expect(contestant.name).to.equal(CONTESTANT_NAMES[i]);
        expect(contestant.voteCount).to.equal(0);
      }
    });
  });

  describe("Registraction", function () {
    it("Should allow registration during registration period", async function () {
      const { zkElection, voter1, owner, registrationStart } =
        await loadFixture(deployzkElectionFixture);

      await time.increaseTo(registrationStart);

      // Mock KYC verification
      await zkElection.connect(voter1).mockSubmitZKPResponse();

      await expect(zkElection.connect(voter1).registerToVote(123))
        .to.emit(zkElection, "Registered")
        .withArgs(123, 1, anyValue); // We accept any value as timestamp
    });

    it("Should not allow double registration", async function () {
      const { zkElection, voter1, owner, registrationStart } =
        await loadFixture(deployzkElectionFixture);

      await time.increaseTo(registrationStart);

      // Mock KYC verification
      await zkElection.connect(voter1).mockSubmitZKPResponse();

      await zkElection.connect(voter1).registerToVote(123);

      await expect(
        zkElection.connect(voter1).registerToVote(456)
      ).to.be.revertedWith("Voter already registered");
    });
  });

  describe("Voting", function () {
    it("Should not allow voting before start time", async function () {
      const { zkElection, voter1, registrationStart } = await loadFixture(
        deployzkElectionFixture
      );

      await time.increaseTo(registrationStart);

      await expect(
        zkElection.connect(voter1).vote(
          0,
          [0, 0],
          [
            [0, 0],
            [0, 0],
          ],
          [0, 0],
          [0, 0]
        )
      ).to.be.revertedWith("Voting is not open");
    });

    it("Should allow voting during voting period", async function () {
      const {
        zkElection,
        mockVerifier,
        voter1,
        owner,
        registrationStart,
        votingStart,
      } = await loadFixture(deployzkElectionFixture);

      await time.increaseTo(registrationStart);

      const secret = 1234;
      const nullifier = 1234567;
      let commitment = F.toObject(poseidon([secret, nullifier]));

      // Mock KYC verification and registration
      await zkElection.connect(voter1).mockSubmitZKPResponse();
      await zkElection.connect(voter1).registerToVote(commitment);

      await time.increaseTo(votingStart);

      // Mock the verifier to return true
      await mockVerifier.setVerificationResult(true);

      await expect(
        zkElection.connect(voter1).vote(
          0,
          [0, 0],
          [
            [0, 0],
            [0, 0],
          ],
          [0, 0],
          [1, 2]
        )
      )
        .to.emit(zkElection, "Voted")
        .withArgs(0);

      const contestant = await zkElection.getContestant(0);
      expect(contestant.voteCount).to.equal(1);
    });

    it("Should not allow double voting", async function () {
      const {
        zkElection,
        mockVerifier,
        voter1,
        owner,
        registrationStart,
        votingStart,
      } = await loadFixture(deployzkElectionFixture);

      await time.increaseTo(registrationStart);
      const secret = 1234;
      const nullifier = 1234567;
      let commitment = F.toObject(poseidon([secret, nullifier]));

      // Mock KYC verification and registration
      await zkElection.connect(voter1).mockSubmitZKPResponse();
      await zkElection.connect(voter1).registerToVote(commitment);

      await time.increaseTo(votingStart);

      // Mock the verifier to return true
      await mockVerifier.setVerificationResult(true);

      await zkElection.connect(voter1).vote(
        0,
        [0, 0],
        [
          [0, 0],
          [0, 0],
        ],
        [0, 0],
        [1, 2]
      );

      await expect(
        zkElection.connect(voter1).vote(
          1,
          [0, 0],
          [
            [0, 0],
            [0, 0],
          ],
          [0, 0],
          [1, 2]
        )
      ).to.be.revertedWith("Vote already cast");
    });
  });
});
