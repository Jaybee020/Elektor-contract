import { buildPoseidon } from "circomlibjs";
import { groth16 } from "snarkjs";
import { IncrementalMerkleTree } from "@zk-kit/incremental-merkle-tree";
import {
  Contract,
  Interface,
  BigNumberish,
  JsonRpcProvider,
  Log,
  zeroPadValue,
} from "ethers";
import zkVoterJson from "../artifacts/contracts/zkElection.sol/ZkElection.json";

const providerUrl = "";
const zkvoterContractAddr = "0xc9a1572b04Cc69D6d1231E7FCF0f81dC78b49A89";

type BigIntish = bigint | BigNumberish | string | number;

function unstringifyBigInts(o: any): any {
  if (typeof o == "string" && /^[0-9]+$/.test(o)) {
    return BigInt(o);
  } else if (typeof o == "string" && /^0x[0-9a-fA-F]+$/.test(o)) {
    return BigInt(o);
  } else if (Array.isArray(o)) {
    return o.map(unstringifyBigInts);
  } else if (typeof o == "object") {
    if (o === null) return null;
    const res: { [key: string]: any } = {};
    const keys = Object.keys(o);
    keys.forEach((k) => {
      res[k] = unstringifyBigInts(o[k]);
    });
    return res;
  } else {
    return o;
  }
}

function convert(F: any, value: BigIntish): string {
  if (typeof value == "bigint") {
    return String(value);
  }
  return String(F.toObject(value));
}

export function getProvider(networkUrl: string): JsonRpcProvider {
  return new JsonRpcProvider(networkUrl);
}

export async function getzkVoter(): Promise<Contract> {
  const provider = getProvider(providerUrl);
  const zkVoter = new Contract(zkvoterContractAddr, zkVoterJson.abi, provider);

  return zkVoter;
}

interface FetchLogsParams {
  contractAddr: string;
  abi: any[];
  eventName: string;
  topics: (string | null)[];
  fromBlock: number;
  toBlock: number | "latest";
}

async function fetchLogs(params: FetchLogsParams): Promise<Log[]> {
  const provider = getProvider(providerUrl);
  const startBlock = params.fromBlock;
  const zkVoterCOntract = await getzkVoter();
  const untilBlock =
    params.toBlock === "latest"
      ? (await provider.getBlockNumber()) || 0
      : params.toBlock;
  const filter = {
    topics: [zkVoterCOntract.interface.getEvent("Register")!.topicHash],
    toBlock: "latest",
    fromBlock: 0, //change to from block
  };
  try {
    const logData = await provider.getLogs(filter);
    return logData;
  } catch (error: any) {
    console.log(error);
    const errorMessage =
      JSON.parse(error.body).error.message ||
      error?.error?.message ||
      error?.data?.message ||
      error?.message;
    if (
      !errorMessage.includes("Log response size exceeded") &&
      !errorMessage.includes("query returned more than 10000 results")
    ) {
      throw new Error("Error fetching logs due to" + error?.error?.message);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    const middle = Math.floor((startBlock + Number(untilBlock)) / 2);
    const lowerPromise = fetchLogs({
      ...params,
      toBlock: middle,
    });
    const upperPromise = fetchLogs({
      ...params,
      fromBlock: middle,
      toBlock: params.toBlock,
    });
    const [lowerLog, upperLog] = await Promise.all([
      lowerPromise,
      upperPromise,
    ]);
    return [...lowerLog, ...upperLog];
  }
}

export async function getLeaves(zkVoter: Contract): Promise<any[]> {
  const contractIface = new Interface(zkVoterJson.abi);
  console.log("Getting contract state...");
  const fromBlock = 3595561; //set from block to a recent block to prevent fetching from root
  const params: FetchLogsParams = {
    abi: zkVoterJson.abi,
    contractAddr: zkvoterContractAddr,
    eventName: "Register",
    topics: [],
    fromBlock: fromBlock,
    toBlock: "latest",
  };

  const events = (await fetchLogs(params)).map((log) =>
    contractIface.decodeEventLog("Deposit", log.data, log.topics)
  );
  console.log(events);
  const leaves = events
    .sort((a, b) => a.leafIndex.sub(b.leafIndex).toNumber()) // Sort events in chronological order
    .map((e) => e.commitment);

  return leaves;
}

export async function getSolidityCallData(
  zkVoter: Contract,
  secret: BigIntish,
  nullifier: BigIntish
): Promise<[string[], string[][], string[], string[]]> {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const root = await zkVoter.getRoot();
  const commitment = F.toObject(poseidon([secret, nullifier]));
  let nullifierHash = F.toObject(poseidon([nullifier]));
  const treeDepth = 25; //get the tree depth deployed
  const tree = new IncrementalMerkleTree(poseidon, treeDepth, BigInt(0), 2);
  const leafs = await getLeaves(zkVoter);

  leafs.forEach((leaf) => {
    tree.insert(BigInt(leaf.toString()));
  });
  const index = tree.indexOf(commitment);
  const inclusionProof = tree.createProof(index);
  const path_index = inclusionProof.pathIndices.map(String);
  const path_elements = inclusionProof.siblings.flat().map((sibling) => {
    return convert(F, sibling);
  });

  const Input = {
    nullifier: nullifier.toString(),
    secret: secret.toString(),
    path_elements: path_elements,
    path_index: path_index,
    root: convert(F, tree.root),
    nullifierHash: String(nullifierHash),
  };
  var { proof, publicSignals } = await groth16.fullProve(
    Input,
    "../../Withdraw.wasm",
    "../../circuit_final.zkey"
  );
  const editedPublicSignals = unstringifyBigInts(publicSignals);
  const editedProof = unstringifyBigInts(proof);
  const calldata = await groth16.exportSolidityCallData(
    editedProof,
    editedPublicSignals
  );
  const argv = calldata
    .replace(/["[\]\s]/g, "")
    .split(",")
    .map((x) => BigInt(x).toString());

  const a = [argv[0], argv[1]];
  const b = [
    [argv[2], argv[3]],
    [argv[4], argv[5]],
  ];
  const c = [argv[6], argv[7]];
  const input = argv.slice(8);
  console.log(a, b, c, input);
  return [a, b, c, input];
}

export async function encodeCallData(
  to: string,
  fee: BigNumberish,
  a: string[],
  b: string[][],
  c: string[],
  input: string[]
): Promise<string> {
  let ABI = [
    "function withdraw(address payable to,uint256 fee, uint[2] memory a,uint[2][2] memory b,uint[2] memory c,uint[2] memory input)",
  ];
  let iface = new Interface(ABI);
  const callData = iface.encodeFunctionData("withdraw", [
    to,
    fee,
    a,
    b,
    c,
    input,
  ]);
  return callData;
}

export async function getRelayers(n: number = 1): Promise<void> {}

export async function register(secret: number, nullifier: number) {
  const zkvoter = await getzkVoter();
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  let commitment = F.toObject(poseidon([secret, nullifier]));
  zkvoter.register(commitment);
}

export async function vote(
  secret: number,
  nullifier: number,
  contestantId: number
) {
  //   if (!(await hasAccounts()) && !(await requestAccounts())) {
  //     //asking metamask for accounts in it and requesting the account
  //     throw new Error("Please install metamask");
  //   }

  const zkvoter = await getzkVoter();
  const [a, b, c, input] = await getSolidityCallData(
    zkvoter,
    secret,
    nullifier
  );
  const receipt = await zkvoter.vote(contestantId, a, b, c, input);
  const txHash = await receipt.wait();
  return "Successfully vote " + txHash.transactionHash;
}
