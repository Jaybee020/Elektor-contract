pragma circom 2.0.0;
include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/mux1.circom";

template commitmentHasher(){
    signal input nullifier;//random salt for hash function
    signal input secret;//secret value 
    signal output commitment;//commitment value added to tree
    signal output nullifierHash;//output hash to prevent double withdrawal

    component commitmenthasher=Poseidon(2);
    commitmenthasher.inputs[0]<==secret;
    commitmenthasher.inputs[1]<==nullifier;

    commitment<== commitmenthasher.out;
    
    component nullifierhasher=Poseidon(1);
    nullifierhasher.inputs[0]<==nullifier;
    
    nullifierHash<== nullifierhasher.out;

}

template MerkleTreeInclusionProof(n) {
    signal input leaf;
    signal input path_elements[n];
    signal input path_index[n]; // path index are 0's and 1's indicating whether the current element is on the left or right
    signal output root; // note that this is an OUTPUT signal
    signal output nullifier;

    signal hashes[n+1];
    hashes[0]<==leaf;
    component hashers[n];
    component mux[n];
    for(var i=0;i<n;i++){
        hashers[i]=Poseidon(2);
        mux[i]=MultiMux1(2);
        //initializeing the multiplexer and poseidon hasher component
        mux[i].c[0][0]<==hashes[i];
        mux[i].c[0][1]<==path_elements[i];
        mux[i].c[1][0]<==path_elements[i];
        mux[i].c[1][1]<==hashes[i];
        mux[i].s<==path_index[i];//multiplexer selecctor signal (to use as if else)
        
        hashers[i].inputs[0]<==mux[i].out[0];
        hashers[i].inputs[1]<==mux[i].out[1];
        hashes[i+1]<==hashers[i].out;
    }
    root<==hashes[n];

}



