// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MockVerifier {
    bool private verificationResult;

    function setVerificationResult(bool _result) external {
        verificationResult = _result;
    }

    function verifyProof(
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[2] memory input
    ) external view returns (bool r) {
        return verificationResult;
    }
}