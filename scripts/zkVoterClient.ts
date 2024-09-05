import Web3, { TransactionReceipt } from "web3";
import { Contract } from "web3-eth-contract";
import { AbiItem } from "web3-utils";
import { abi } from "../artifacts/contracts/zkElection.sol/ZkElection.json"; // Assuming you have the ABI in this file

export class ZkElectionProvider {
  private web3: Web3;
  private contract: Contract<any>;

  constructor(contractAddress: string, web3Provider: string) {
    this.web3 = new Web3(web3Provider);
    this.contract = new this.web3.eth.Contract(abi, contractAddress);
  }

  private async sendTransaction(
    method: any,
    ...args: any[]
  ): Promise<TransactionReceipt> {
    const accounts = await this.web3.eth.getAccounts();
    const from = accounts[0];
    const gas = await method(...args).estimateGas({ from });
    return method(...args).send({ from, gas });
  }

  // Election Information
  async getElection(): Promise<any> {
    return this.contract.methods.election().call();
  }

  async getContestantCount(): Promise<string> {
    return this.contract.methods.getContestantCount().call();
  }

  async getContestant(
    index: number
  ): Promise<{ name: string; voteCount: string }> {
    return this.contract.methods.getContestant(index).call();
  }

  // Registration
  async registerToVote(commitment: string): Promise<TransactionReceipt> {
    return this.sendTransaction(
      this.contract.methods.registerToVote,
      commitment
    );
  }

  // Voting
  async vote(
    contestantId: number,
    a: [string, string],
    b: [[string, string], [string, string]],
    c: [string, string],
    input: [string, string]
  ): Promise<TransactionReceipt> {
    return this.sendTransaction(
      this.contract.methods.vote,
      contestantId,
      a,
      b,
      c,
      input
    );
  }

  // State Checks
  async isRegistered(address: string): Promise<boolean> {
    return this.contract.methods.isRegistered(address).call();
  }

  async hasKYC(address: string): Promise<boolean> {
    return this.contract.methods.hasKYC(address).call();
  }

  // Merkle Tree Operations
  async getIndex(): Promise<string> {
    return this.contract.methods.getIndex().call();
  }

  //   async insertLeaf(commitment: string): Promise<TransactionReceipt> {
  //     return this.sendTransaction(this.contract.methods.insertLeaf, commitment);
  //   }

  async isKnownRoot(root: string): Promise<boolean> {
    return this.contract.methods.isKnownRoot(root).call();
  }

  // KYC Verification (for admin use)
  async submitZKPResponse(
    requestId: number,
    address: string,
    inputs: string[]
  ): Promise<TransactionReceipt> {
    return this.sendTransaction(
      this.contract.methods.submitZKPResponse,
      requestId,
      address,
      inputs
    );
  }

  // Events
  onRegistered(callback: (event: any) => void): void {
    this.contract.events.Registered().on("data", (event: any) => {
      const { commitment, leafIndex, timestamp } = event.returnValues;
      callback({ commitment, leafIndex, timestamp });
    });
  }

  onVoted(callback: (event: any) => void): void {
    this.contract.events.Voted().on("data", (event: any) => {
      const { contestantId } = event.returnValues;
      callback({ contestantId });
    });
  }

  onElectionStateChanged(callback: (event: any) => void): void {
    this.contract.events.ElectionStateChanged().on("data", (event: any) => {
      const { newState } = event.returnValues;
      callback({ newState });
    });
  }
}
