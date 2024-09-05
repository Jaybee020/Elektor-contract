import { ethers } from "hardhat";
const buildPoseidon = require("circomlibjs").buildPoseidon;
const { poseidonContract } = require("circomlibjs");

async function deployZkVVoter() {
  // const poseidon = await buildPoseidon();
  // const F = poseidon.F;
  // const poseidonT3 = await ethers.getContractFactory(
  //   poseidonContract.generateABI(2),
  //   poseidonContract.createCode(2)
  // );
  // //@ts-ignore
  // await poseidonT3.deploy();
  // //@ts-ignore
  // await poseidonT3.deployed();
  // //@ts-ignore
  const poseidonAddr = "0xfdac7da2da2022e5f9a602464748fc2ddd79ba14";

  console.log("poseidon contract deployed at ", poseidonAddr);
  // const incrementalBinaryTreeLibContract = await ethers.deployContract(
  //   "IncrementalBinaryTree",
  //   {
  //     libraries: {
  //       PoseidonT3: poseidonAddr,
  //     },
  //   }
  // );

  // await incrementalBinaryTreeLibContract.waitForDeployment();

  const incrementalBinaryTreeLibContractAddr =
    "0xe8c1c59fbee1e69d0b8e160f4e27d117615a97be";

  // const verifierContract = await ethers.deployContract("");
  // await verifierContract.waitForDeployment();
  const verifierContractAddr = "0x877ce49b8ba3e7c0e2d3dbdf42ede9734fe553c3";

  //The incremental binary tree,poseidon and verifier contract should only be deployed once. Can be commented out after deployed once and addresses are saved
  console.log(
    `Verifier contract deployed at ${verifierContractAddr}. Incremental Binary Tree deployed at ${incrementalBinaryTreeLibContractAddr}`
  );
  const DEPTH = 3;
  const TITLE = "Test Election";
  const MAX_VOTERS = 1000;
  const CONTESTANT_NAMES = ["Alice", "Bob", "Charlie"];

  const ONE_HOUR = 60 * 60;
  const ONE_DAY = 24 * ONE_HOUR;

  const now = Math.floor(Date.now() / 1000);
  const registrationStart = now + ONE_HOUR;
  const registrationEnd = registrationStart + ONE_DAY;
  const votingStart = registrationEnd + ONE_HOUR;
  const votingEnd = votingStart + ONE_DAY;

  const zkVoter = await ethers.deployContract(
    "ZkElection",
    [
      verifierContractAddr,
      DEPTH,
      TITLE,
      registrationStart,
      registrationEnd,
      votingStart,
      votingEnd,
      MAX_VOTERS,
      CONTESTANT_NAMES,
    ],
    {
      libraries: {
        IncrementalBinaryTree: incrementalBinaryTreeLibContractAddr, //replace with Binary tree Contract address on console after first deployment
      },
    }
  );

  await zkVoter.waitForDeployment();

  return zkVoter;
}

(async function run() {
  const mixer = await deployZkVVoter();
  console.log(
    "zkVoter contract has been deployed to 0xc9a1572b04Cc69D6d1231E7FCF0f81dC78b49A89 " +
      mixer.target
  );
})();
