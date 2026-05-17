// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

//  Purpose:
//  Governance contract that allows wallet holders to:
//  - Create proposals
//  - Vote yes or no
//  - Execute approved proposals

contract CustodyDAO {

    // OWNER
    address public owner;

    // PROPOSAL STRUCTURE
    struct Proposal {
        uint proposalId;          // unique ID
        string description;       // what the proposal is about
        address proposer;         // who created it
        uint deadline;            // voting closes at this timestamp
        uint yesVotes;            // count of yes votes
        uint noVotes;             // count of no votes
        bool executed;            // has it been executed yet
    }

    // STORAGE

    // stores all proposals by their ID
    mapping(uint => Proposal) public proposals;

    // tracks whether an address has voted on a specific proposal
    // mapping(proposalId => mapping(walletAddress => hasVoted))
    mapping(uint => mapping(address => bool)) public hasVoted;

    // total number of proposals created so far
    uint public proposalCount;

    // minimum yes votes needed to execute a proposal (quorum)
    uint public quorum;

    // EVENTS
    event ProposalCreated(
        uint indexed proposalId,
        address indexed proposer,
        string description,
        uint deadline
    );

    event Voted(
        uint indexed proposalId,
        address indexed voter,
        bool support         // true = yes, false = no
    );

    event ProposalExecuted(
        uint indexed proposalId,
        bool passed          // true if yes votes won
    );

    // MODIFIERS

    // only the contract deployer can do certain things
    modifier onlyOwner() {
        require(msg.sender == owner, "Not the contract owner");
        _;
    }

    // proposal must exist
    modifier validProposal(uint _proposalId) {
        require(_proposalId > 0 && _proposalId <= proposalCount, "Proposal does not exist");
        _;
    }

    // voting must still be open (deadline not passed)
    modifier votingOpen(uint _proposalId) {
        require(block.timestamp < proposals[_proposalId].deadline, "Voting period has ended");
        _;
    }

    // voting must be closed before execution
    modifier votingClosed(uint _proposalId) {
        require(block.timestamp >= proposals[_proposalId].deadline, "Voting is still open");
        _;
    }

    // CONSTRUCTOR
    // Called once when contract is deployed
    constructor(uint _quorum) {
        owner = msg.sender;
        quorum = _quorum;
    }

    // FUNCTION 1 — CREATE PROPOSAL
    // Anyone can create a proposal
    // _description : what the proposal is about
    // _durationInMinutes : how long voting stays open

    function createProposal(string memory _description, uint _durationInMinutes) public returns (uint) {

        // basic validation
        require(bytes(_description).length > 0, "Description cannot be empty");
        require(_durationInMinutes > 0, "Duration must be greater than zero");

        // increment counter to get a new unique ID
        proposalCount++;

        // calculate when voting closes
        uint deadline = block.timestamp + (_durationInMinutes * 1 minutes);

        // create and store the proposal
        proposals[proposalCount] = Proposal({
            proposalId:  proposalCount,
            description: _description,
            proposer:    msg.sender,
            deadline:    deadline,
            yesVotes:    0,
            noVotes:     0,
            executed:    false
        });

        // emit event for frontend
        emit ProposalCreated(proposalCount, msg.sender, _description, deadline);

        return proposalCount;
    }

    // FUNCTION 2 — VOTE
    // Any wallet can vote yes or no on a proposal
    // _proposalId : which proposal to vote on
    // _support    : true = yes, false = no

    function vote( uint _proposalId, bool _support) public validProposal(_proposalId) votingOpen(_proposalId)
    {
        // prevent double voting
        require(!hasVoted[_proposalId][msg.sender], "You have already voted on this proposal");

        // mark this wallet as having voted
        hasVoted[_proposalId][msg.sender] = true;

        // add to the correct vote count
        if (_support) {
            proposals[_proposalId].yesVotes++;
        } else {
            proposals[_proposalId].noVotes++;
        }

        // emit event
        emit Voted(_proposalId, msg.sender, _support);
    }

    // FUNCTION 3 — EXECUTE PROPOSAL
    // Can only be called after voting deadline has passed
    // Checks quorum and yes/no result

    function executeProposal(uint _proposalId ) public validProposal(_proposalId) votingClosed(_proposalId)
    {
        Proposal storage proposal = proposals[_proposalId];

        // cannot execute twice
        require(!proposal.executed, "Proposal already executed");

        // mark as executed regardless of result
        proposal.executed = true;

        // check if quorum was reached and yes votes won
        bool passed = (proposal.yesVotes >= quorum) &&
                      (proposal.yesVotes > proposal.noVotes);

        // emit result
        emit ProposalExecuted(_proposalId, passed);
    }

    // VIEW FUNCTIONS
    // These are free to call (no gas) — used by frontend

    // get full details of a proposal
    function getProposal(uint _proposalId)
        public
        view
        validProposal(_proposalId)
        returns (
            uint id,
            string memory description,
            address proposer,
            uint deadline,
            uint yesVotes,
            uint noVotes,
            bool executed
        )
    {
        Proposal storage p = proposals[_proposalId];
        return (
            p.proposalId,
            p.description,
            p.proposer,
            p.deadline,
            p.yesVotes,
            p.noVotes,
            p.executed
        );
    }

    // check if a specific wallet has voted on a proposal
    function checkIfVoted(uint _proposalId, address _voter)
        public
        view
        returns (bool)
    {
        return hasVoted[_proposalId][_voter];
    }

    // get current vote counts for a proposal
    function getVoteCounts(uint _proposalId)
        public
        view
        validProposal(_proposalId)
        returns (uint yes, uint no)
    {
        return (
            proposals[_proposalId].yesVotes,
            proposals[_proposalId].noVotes
        );
    }

    // check if voting is still active
    function isVotingActive(uint _proposalId)
        public
        view
        validProposal(_proposalId)
        returns (bool)
    {
        return block.timestamp < proposals[_proposalId].deadline;
    }

    // ADMIN — update quorum (only owner)

    function updateQuorum(uint _newQuorum) public onlyOwner {
        require(_newQuorum > 0, "Quorum must be greater than zero");
        quorum = _newQuorum;
    }
}
