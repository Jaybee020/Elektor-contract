// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "./lib/MerkleTree.sol";
import "./lib/ReentrancyGuard.sol";
import "./Verifier.sol";
import "./interfaces/ICircuitValidator.sol";
import "./lib/GenesisUtils.sol";
import {EmbeddedZKPVerifier} from "./lib/EmbeddedZKPVerifier.sol";
import {PrimitiveTypeUtils} from "./lib/PrimitiveTypeUtils.sol";

interface IVerifier {
    function verifyProof(
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[2] memory input
    ) external view returns (bool r);
}

contract ZkElection is Tree, ReentrancyGuard,EmbeddedZKPVerifier {
    enum ElectionState { Created, OngoingRegistration, RegistrationClosed, VotingStarted, VotingEnded }
    uint64 public AGE_KYC_REQUEST_ID = 1;
    uint64 public NATIONALITY_KYC_REQUEST_ID = 2;

    struct Contestant {
        string name;
        uint256 voteCount;
    }

    struct Election {
        uint256 id;
        uint256 createdAt;
        uint256 registrationStart;
        uint256 registrationEnd;
        uint256 votingStart;
        uint256 votingEnd;
        uint256 maxVoters;
        uint256 registeredVotersCount;
        ElectionState currentState;
        uint256[] contestantIds;
        string title;
    }

//     address public  factory;
    IVerifier public immutable verifier;
    mapping(uint256 => bool) public nullifierHashes;
    mapping(uint256 => bool) public commitments;
    mapping(address => bool) public isRegistered;
    mapping(address => bool) public hasKYC;
    Election public election;
    mapping(uint256 => Contestant) public contestants;

    uint256 constant MAX_CONTESTANTS = 20;
    uint256 constant MIN_REGISTRATION_DURATION = 1 days;
    uint256 constant MIN_VOTING_DURATION = 1 days;
    uint256 constant MAX_ELECTION_DURATION = 30 days;

    event Registered(uint256 indexed commitment, uint256 leafIndex, uint256 timestamp);
    event Voted(uint256 contestantId);
    event ElectionStateChanged(ElectionState newState);

    constructor(
        address _verifier,
     //    address _factory,
        uint32 _depth, 
        string memory _title,
        uint256 _registrationStart,
        uint256 _registrationEnd,
        uint256 _votingStart,
        uint256 _votingEnd,
        uint256 _maxVoters,
        string[] memory _contestantNames
    ) Tree(_depth)  {
        verifier = IVerifier(_verifier);
     //    factory = _factory;
        createElection(_title, _registrationStart, _registrationEnd, _votingStart, _votingEnd, _maxVoters, _contestantNames);
    }

    function _beforeProofSubmit(
      uint64 requestId ,
      uint256[] memory inputs,
      ICircuitValidator validator
   ) internal view override {
    address addr = PrimitiveTypeUtils.uint256ToAddress(inputs[validator.inputIndexOf('challenge')]);
    require(requestId == AGE_KYC_REQUEST_ID && !hasKYC[addr]);
   }

   function _afterProofSubmit(
      uint64 requestId,
      uint256[] memory inputs,
      ICircuitValidator validator
   ) internal override {
     require(requestId == AGE_KYC_REQUEST_ID);
     hasKYC[PrimitiveTypeUtils.uint256ToAddress(inputs[validator.inputIndexOf('challenge')])] = true;
   }

    function createElection(
        string memory _title,
        uint256 _registrationStart,
        uint256 _registrationEnd,
        uint256 _votingStart,
        uint256 _votingEnd,
        uint256 _maxVoters,
        string[] memory _contestantNames
    ) private {
        require(_contestantNames.length > 1 && _contestantNames.length <= MAX_CONTESTANTS, "Invalid number of contestants");
        require(_registrationStart >= block.timestamp, "Registration start time must be in the future");
        require(_registrationEnd > _registrationStart, "Registration end must be after start");
        require(_votingStart > _registrationEnd, "Voting must start after registration ends");
        require(_votingEnd > _votingStart, "Voting end must be after start");
        require(_votingEnd - _registrationStart <= MAX_ELECTION_DURATION, "Election duration too long");
        require(_registrationEnd - _registrationStart >= MIN_REGISTRATION_DURATION, "Registration period too short");
        require(_votingEnd - _votingStart >= MIN_VOTING_DURATION, "Voting period too short");
        require(_maxVoters > 0, "Max voters must be greater than 0");

        election.id = block.timestamp; // Using timestamp as a simple unique identifier
        election.title = _title;
        election.createdAt = block.timestamp;
        election.registrationStart = _registrationStart;
        election.registrationEnd = _registrationEnd;
        election.votingStart = _votingStart;
        election.votingEnd = _votingEnd;
        election.maxVoters = _maxVoters;
        election.registeredVotersCount = 0;
        election.currentState = ElectionState.Created;

        for (uint i = 0; i < _contestantNames.length; i++) {
            uint256 contestantId = uint256(keccak256(abi.encodePacked(election.id, i)));
            contestants[contestantId] = Contestant({
                name: _contestantNames[i],
                voteCount: 0
            });
            election.contestantIds.push(contestantId);
        }

        emit ElectionStateChanged(ElectionState.Created);
    }


    function registerToVote(uint256 _commitment) public {
        // Election storage election = elections[_electionId];
        require(block.timestamp >= election.registrationStart && block.timestamp <= election.registrationEnd, "Registration is not open");
        // require(hasKYC[msg.sender], "Voter is not KYC verified");
        require(isRegistered[msg.sender] == false, "Voter already registered");
        require(!commitments[_commitment],"Commitment has been used previously");

        // tree.insert(_commitment);//insert the new commitment to the leaf
        insertLeaf(_commitment);
        commitments[_commitment]=true;//update commitment value state
        uint newIndex=getIndex();

        // Here you would typically add more checks, such as age verification, citizenship, etc.
        // For simplicity, we're just marking the voter as registered
        isRegistered[msg.sender] = true;

        if (election.currentState == ElectionState.Created) {
            election.currentState = ElectionState.OngoingRegistration;
        }
        emit Registered(_commitment, newIndex, block.timestamp);
        }


    function vote(
        uint256 _contestantId,
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[2] memory input
    ) external nonReentrant returns (bool) {
        require(block.timestamp >= election.votingStart && block.timestamp <= election.votingEnd, "Voting is not open");
        require(_contestantId < election.contestantIds.length, "Invalid contestant");
        require(!nullifierHashes[input[1]], "Vote already cast");
        require(isKnownRoot(input[0]), "Invalid Merkle root");
        require(verifier.verifyProof(a, b, c, input), "Invalid proof");
        require(isRegistered[msg.sender], "Voter is not registered");

        nullifierHashes[input[1]] = true;
        uint256 actualContestantId = election.contestantIds[_contestantId];
        contestants[actualContestantId].voteCount++;

        if (election.currentState == ElectionState.RegistrationClosed) {
            election.currentState = ElectionState.VotingStarted;
            emit ElectionStateChanged(ElectionState.VotingStarted);
        }

        emit Voted(_contestantId);
        return true;
    }

    function getContestantCount() external view returns (uint256) {
        return election.contestantIds.length;
    }

    function getContestant(uint256 _index) external view returns (string memory name, uint256 voteCount) {
        require(_index < election.contestantIds.length, "Invalid contestant index");
        uint256 contestantId = election.contestantIds[_index];
        Contestant memory contestant = contestants[contestantId];
        return (contestant.name, contestant.voteCount);
    }
}
