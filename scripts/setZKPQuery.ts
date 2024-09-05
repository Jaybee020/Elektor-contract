import hre from "hardhat";
import Web3 from "web3";
import { poseidon } from "@iden3/js-crypto";
import { SchemaHash } from "@iden3/js-iden3-core";
import { prepareCircuitArrayValues } from "@0xpolygonid/js-sdk";
import { ethers, JsonRpcProvider } from "ethers";

// Put your values here
const ZKVOTING_ADDRESS = "0x2097B8d88Ae5e7069A43158d825bcd5e13e4ee70";
const VALIDATOR_ADDRESS = "0xEEd5068AD8Fecf0b9a91aF730195Fef9faB00356";

const Operators = {
  NOOP: 0, // No operation, skip query verification in circuit
  EQ: 1, // equal
  LT: 2, // less than
  GT: 3, // greater than
  IN: 4, // in
  NIN: 5, // not in
  NE: 6, // not equal
};

function packValidatorParams(query: any, allowedIssuers = []) {
  let web3 = new Web3(Web3.givenProvider || "ws://localhost:8545");
  return web3.eth.abi.encodeParameter(
    {
      CredentialAtomicQuery: {
        schema: "uint256",
        claimPathKey: "uint256",
        operator: "uint256",
        slotIndex: "uint256",
        value: "uint256[]",
        queryHash: "uint256",
        allowedIssuers: "uint256[]",
        circuitIds: "string[]",
        skipClaimRevocationCheck: "bool",
        claimPathNotExists: "uint256",
      },
    },
    {
      schema: query.schema,
      claimPathKey: query.claimPathKey,
      operator: query.operator,
      slotIndex: query.slotIndex,
      value: query.value,
      queryHash: BigInt(query.queryHash),
      allowedIssuers: allowedIssuers,
      circuitIds: query.circuitIds,
      skipClaimRevocationCheck: query.skipClaimRevocationCheck,
      claimPathNotExists: query.claimPathNotExists,
    }
  );
}

function coreSchemaFromStr(schemaIntString: string) {
  const schemaInt = BigInt(schemaIntString);
  return SchemaHash.newSchemaHashFromInt(schemaInt);
}

function calculateQueryHashV2(
  values: any,
  schema: any,
  slotIndex: any,
  operator: any,
  claimPathKey: any,
  claimPathNotExists: any
) {
  const expValue = prepareCircuitArrayValues(values, 64);
  const valueHash = poseidon.spongeHashX(expValue, 6);
  const schemaHash = coreSchemaFromStr(schema);
  const quaryHash = poseidon.hash([
    schemaHash.bigInt(),
    BigInt(slotIndex),
    BigInt(operator),
    BigInt(claimPathKey),
    BigInt(claimPathNotExists),
    valueHash,
  ]);
  return quaryHash;
}

async function main() {
  // you can run https://go.dev/play/p/oB_oOW7kBEw to get schema hash and claimPathKey using YOUR schema
  const schemaBigInt = "65533605878895782440239267556852131241";

  const type = "NationalCard";
  const schemaUrl =
    "https://gist.githubusercontent.com/prettyirrelevant/21ffe2f0402b2d9120b50ee9e9556e25/raw/97cac049de388e0d2f033b777631fbc7ef49582d/NationalCardLD.json";
  // merklized path to field in the W3C credential according to JSONLD  schema e.g. birthday in the KYCAgeCredential under the url "https://raw.githubusercontent.com/iden3/claim-schema-vocab/main/schemas/json-ld/kyc-v3.json-ld"
  const schemaClaimPathKey =
    "20952901978069699558672824959089062676350447074527463146331087771327378355701";

  const requestId = 1;
  // const claimPathDoesntExist = 0;

  const query: any = {
    requestId,
    schema: BigInt(schemaBigInt),
    claimPathKey: BigInt(schemaClaimPathKey),
    operator: Operators.LT,
    slotIndex: 0,
    value: [20060904, ...new Array(63).fill(0)], // for operators 1-3 only first value matters
    circuitIds: ["credentialAtomicQueryMTPV2OnChain"],
    skipClaimRevocationCheck: false,
    claimPathNotExists: 0,
  };

  query.queryHash = calculateQueryHashV2(
    query.value,
    query.schema,
    query.slotIndex,
    query.operator,
    query.claimPathKey,
    query.claimPathNotExists
  ).toString();

  console.log(query.quaryHash);

  let erc20Verifier = await hre.ethers.getContractAt(
    "ZkElection",
    ZKVOTING_ADDRESS
  );

  const data = await erc20Verifier.election();
  console.log(data);
  const invokeRequestMetadata = {
    id: "8317ef97-1db3-40f2-b74f-6b27758bddcc",
    typ: "application/iden3comm-plain-json",
    type: "NationalCard",
    thid: "8317ef97-1db3-40f2-b74f-6b27758bddcc",
    body: {
      reason: "zk_voting",
      transaction_data: {
        contract_address: ZKVOTING_ADDRESS,
        method_id: "b68967e2",
        chain_id: 80002,
        network: "polygon-amoy",
      },
      scope: [
        {
          id: query.requestId,
          circuitId: query.circuitIds[0],
          query: {
            allowedIssuers: ["*"],
            context: schemaUrl,
            credentialSubject: {
              birthday: {
                $lt: query.value[0],
              },
            },
            type,
          },
        },
      ],
    },
  };

  try {
    // ############ Use this code to set request in ERC20Verifier ############

    const abi = [
      {
        inputs: [],
        name: "version",
        outputs: [{ internalType: "string", name: "", type: "string" }],
        stateMutability: "pure",
        type: "function",
      },
    ];

    // Create an instance of the contract
    //@ts-ignore
    const provider = new JsonRpcProvider(
      "https://polygon-amoy.g.alchemy.com/v2/GAG9zhOv7cSHQdF77ZD3L27aN4JGiwGm"
    );
    const contract = new ethers.Contract(VALIDATOR_ADDRESS, abi, provider);

    // Call the version function
    try {
      const version = await contract.version();
      console.log("Contract version:", version);
      return version;
    } catch (error) {
      console.error("Error calling version function:", error);
    }

    const res = await erc20Verifier.setZKPRequest(requestId, {
      metadata: JSON.stringify(invokeRequestMetadata),
      validator: VALIDATOR_ADDRESS,
      data: packValidatorParams(query),
    });

    console.log("Request set");
  } catch (e) {
    console.log("error: ", e);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
