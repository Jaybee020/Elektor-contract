// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract VotingSystem {
    enum ElectionState { Created, OngoingRegistration, RegistrationClosed, VotingStarted, VotingEnded }

    struct Contestant {
        string name;
        uint256 voteCount;
    }

    struct Voter {
        bool isRegistered;
        bool hasVoted;
        uint256 votedContestantId;
    }

    struct Election {
        string title;
        uint256 id;
        uint256 createdAt;
        uint256 registrationStart;
        uint256 registrationEnd;
        uint256 votingStart;
        uint256 votingEnd;
        ElectionState currentState;
        Contestant[] contestants;
        mapping(address => Voter) voters;
    }

    address public admin;
    mapping(uint256 => Election) public elections;
    uint256 public electionCount;

    constructor() {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can perform this action");
        _;
    }

    function createElection(
        string memory _title,
        uint256 _registrationStart,
        uint256 _registrationEnd,
        uint256 _votingStart,
        uint256 _votingEnd,
        string[] memory _contestantNames
    ) public onlyAdmin {
        electionCount++;
        Election storage newElection = elections[electionCount];
        newElection.title = _title;
        newElection.id = electionCount;
        newElection.createdAt = block.timestamp;
        newElection.registrationStart = _registrationStart;
        newElection.registrationEnd = _registrationEnd;
        newElection.votingStart = _votingStart;
        newElection.votingEnd = _votingEnd;
        newElection.currentState = ElectionState.Created;

        for (uint i = 0; i < _contestantNames.length; i++) {
            newElection.contestants.push(Contestant({
                name: _contestantNames[i],
                voteCount: 0
            }));
        }
    }


     //should insert hashes into the merkle tree
    function registerToVote(uint256 _electionId) public {
        Election storage election = elections[_electionId];
        require(block.timestamp >= election.registrationStart && block.timestamp <= election.registrationEnd, "Registration is not open");
        require(!election.voters[msg.sender].isRegistered, "Voter already registered");

        // Here you would typically add more checks, such as age verification, citizenship, etc.
        // For simplicity, we're just marking the voter as registered
        election.voters[msg.sender].isRegistered = true;

        if (election.currentState == ElectionState.Created) {
            election.currentState = ElectionState.OngoingRegistration;
        }
    }


     //should verify proof and update the merkle tree
    function vote(uint256 _electionId, uint256 _contestantId) public {
        Election storage election = elections[_electionId];
        require(block.timestamp >= election.votingStart && block.timestamp <= election.votingEnd, "Voting is not open");
        require(election.voters[msg.sender].isRegistered, "Voter is not registered");
        require(!election.voters[msg.sender].hasVoted, "Voter has already voted");
        require(_contestantId < election.contestants.length, "Invalid contestant");

        election.voters[msg.sender].hasVoted = true;
        election.voters[msg.sender].votedContestantId = _contestantId;
        election.contestants[_contestantId].voteCount++;

        if (election.currentState == ElectionState.RegistrationClosed) {
            election.currentState = ElectionState.VotingStarted;
        }
    }

    function getElectionDetails(uint256 _electionId) public view returns (
        string memory title,
        uint256 id,
        uint256 createdAt,
        uint256 registrationStart,
        uint256 registrationEnd,
        uint256 votingStart,
        uint256 votingEnd,
        ElectionState currentState,
        uint256 contestantCount
    ) {
        Election storage election = elections[_electionId];
        return (
            election.title,
            election.id,
            election.createdAt,
            election.registrationStart,
            election.registrationEnd,
            election.votingStart,
            election.votingEnd,
            election.currentState,
            election.contestants.length
        );
    }

    function getContestantDetails(uint256 _electionId, uint256 _contestantId) public view returns (
        string memory name,
        uint256 voteCount
    ) {
        Election storage election = elections[_electionId];
        require(_contestantId < election.contestants.length, "Invalid contestant");
        Contestant storage contestant = election.contestants[_contestantId];
        return (contestant.name, contestant.voteCount);
    }

    // Additional functions for updating election state, ending elections, etc. can be added here
}