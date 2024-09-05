#!/bin/bash

cd circuits
mkdir Voting

#to get trusted ceremony parameters (powers of tau)
if [ -f ./powersOfTau28_hez_final_14.ptau ]; then
    echo "powersOfTau28_hez_final_14.ptau already exists. Skipping."
else
    echo 'Downloading powersOfTau28_hez_final_14.ptau'
    wget https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_14.ptau
fi

echo "Compiling Voting.circom..."

# compile circuit

circom Voting.circom --r1cs --wasm --sym -o Voting
snarkjs r1cs info Voting/Voting.r1cs


# Start a new zkey and make a contribution

snarkjs groth16 setup Voting/Voting.r1cs powersOfTau28_hez_final_14.ptau Voting/circuit_0000.zkey  #start power of tau ceremony
snarkjs zkey contribute Voting/circuit_0000.zkey  Voting/circuit_final.zkey   --name="1st Contributor Name" -v -e="random text"  #phase 2 of trusted event (adding circuit dependent event)
snarkjs zkey export verificationkey Voting/circuit_final.zkey Voting/verification_key.json #export verification key

# generate solidity contract
snarkjs zkey export solidityverifier Voting/circuit_final.zkey ../contracts/Verifier.sol

cd ../..