// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Import EvidenceRegistry so DAO can call burnEvidence()
import "./EvidenceRegistry.sol";

/**
 * @title CustodyDAO
 * @dev Governance contract for ChainCustody
 *
 * FEATURES:
 *  - Create proposals
 *  - Vote YES / NO
 *  - Execute proposals
 *  - DAO-controlled evidence burning
 *
 * FLOW:
 *  1. User creates burn proposal
 *  2. Users vote
 *  3. Proposal passes quorum
 *  4. DAO calls EvidenceRegistry.burnEvidence()
 *  5. NFT gets burned
 */

contract CustodyDAO {

    // ─────────────────────────────────────────────────────────────
    // STATE VARIABLES
    // ─────────────────────────────────────────────────────────────

    /// Contract owner/admin
    address public owner;

    /// Minimum YES votes required
    uint public quorum;

    /// Total proposal count
    uint public proposalCount;

    /// EvidenceRegistry contract reference
    EvidenceRegistry public evidenceRegistry;

    // ─────────────────────────────────────────────────────────────
    // PROPOSAL STRUCTURE
    // ─────────────────────────────────────────────────────────────

    struct Proposal {

        // Proposal ID
        uint proposalId;

        // Human-readable proposal description
        string description;

        // Who created the proposal
        address proposer;

        // Voting deadline timestamp
        uint deadline;

        // YES votes
        uint yesVotes;

        // NO votes
        uint noVotes;

        // Has proposal been executed?
        bool executed;

        // Evidence ID to burn
        uint evidenceId;

        // Is this a burn proposal?
        bool burnProposal;
    }

    // ─────────────────────────────────────────────────────────────
    // STORAGE
    // ─────────────────────────────────────────────────────────────

    /// proposalId => Proposal
    mapping(uint => Proposal) public proposals;

    /// proposalId => voter => voted?
    mapping(uint => mapping(address => bool)) public hasVoted;

    // ─────────────────────────────────────────────────────────────
    // EVENTS
    // ─────────────────────────────────────────────────────────────

    event ProposalCreated(
        uint indexed proposalId,
        address indexed proposer,
        string description,
        uint deadline
    );

    event Voted(
        uint indexed proposalId,
        address indexed voter,
        bool support
    );

    event ProposalExecuted(
        uint indexed proposalId,
        bool passed
    );

    event EvidenceBurnExecuted(
        uint indexed proposalId,
        uint indexed evidenceId
    );

    // ─────────────────────────────────────────────────────────────
    // MODIFIERS
    // ─────────────────────────────────────────────────────────────

    modifier onlyOwner() {

        require(
            msg.sender == owner,
            "Not contract owner"
        );

        _;
    }

    modifier validProposal(uint _proposalId) {

        require(
            _proposalId > 0 &&
            _proposalId <= proposalCount,
            "Proposal does not exist"
        );

        _;
    }

    modifier votingOpen(uint _proposalId) {

        require(
            block.timestamp < proposals[_proposalId].deadline,
            "Voting period ended"
        );

        _;
    }

    modifier votingClosed(uint _proposalId) {

        require(
            block.timestamp >= proposals[_proposalId].deadline,
            "Voting still active"
        );

        _;
    }

    // ─────────────────────────────────────────────────────────────
    // CONSTRUCTOR
    // ─────────────────────────────────────────────────────────────

    /**
     * @param _quorum Minimum YES votes required
     * @param _registryAddress Address of EvidenceRegistry
     */
    constructor(
        uint _quorum,
        address _registryAddress
    ) {

        require(
            _registryAddress != address(0),
            "Invalid registry address"
        );

        owner = msg.sender;

        quorum = _quorum;

        evidenceRegistry = EvidenceRegistry(_registryAddress);
    }

    // ─────────────────────────────────────────────────────────────
    // CREATE BURN PROPOSAL
    // ─────────────────────────────────────────────────────────────

    /**
     * @dev Create proposal to burn evidence NFT
     *
     * @param _description Proposal text
     * @param _durationInMinutes Voting duration
     * @param _evidenceId Evidence to burn
     */
    function createBurnProposal(
        string memory _description,
        uint _durationInMinutes,
        uint _evidenceId
    )
        public
        returns (uint)
    {

        require(
            bytes(_description).length > 0,
            "Description empty"
        );

        require(
            _durationInMinutes > 0,
            "Duration must be > 0"
        );

        proposalCount++;

        uint deadline =
            block.timestamp +
            (_durationInMinutes * 1 minutes);

        proposals[proposalCount] = Proposal({

            proposalId: proposalCount,

            description: _description,

            proposer: msg.sender,

            deadline: deadline,

            yesVotes: 0,

            noVotes: 0,

            executed: false,

            evidenceId: _evidenceId,

            burnProposal: true
        });

        emit ProposalCreated(
            proposalCount,
            msg.sender,
            _description,
            deadline
        );

        return proposalCount;
    }

    // ─────────────────────────────────────────────────────────────
    // VOTE
    // ─────────────────────────────────────────────────────────────

    /**
     * @param _proposalId Proposal ID
     * @param _support true = YES, false = NO
     */
    function vote(
        uint _proposalId,
        bool _support
    )
        public
        validProposal(_proposalId)
        votingOpen(_proposalId)
    {

        require(
            !hasVoted[_proposalId][msg.sender],
            "Already voted"
        );

        hasVoted[_proposalId][msg.sender] = true;

        if (_support) {

            proposals[_proposalId].yesVotes++;

        } else {

            proposals[_proposalId].noVotes++;
        }

        emit Voted(
            _proposalId,
            msg.sender,
            _support
        );
    }

    // ─────────────────────────────────────────────────────────────
    // EXECUTE PROPOSAL
    // ─────────────────────────────────────────────────────────────

    /**
     * @dev Executes approved proposal
     *
     * IF proposal passes:
     *   DAO calls:
     *   registry.burnEvidence()
     */
    function executeProposal(
        uint _proposalId
    )
        public
        validProposal(_proposalId)
        votingClosed(_proposalId)
    {

        Proposal storage proposal =
            proposals[_proposalId];

        require(
            !proposal.executed,
            "Already executed"
        );

        proposal.executed = true;

        bool passed =
            (proposal.yesVotes >= quorum) &&
            (proposal.yesVotes > proposal.noVotes);

        // If passed AND burn proposal
        if (
            passed &&
            proposal.burnProposal
        ) {

            // DAO calls registry burn
            evidenceRegistry.burnEvidence(
                proposal.evidenceId
            );

            emit EvidenceBurnExecuted(
                _proposalId,
                proposal.evidenceId
            );
        }

        emit ProposalExecuted(
            _proposalId,
            passed
        );
    }

    // ─────────────────────────────────────────────────────────────
    // VIEW FUNCTIONS
    // ─────────────────────────────────────────────────────────────

    function getProposal(
        uint _proposalId
    )
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
            bool executed,
            uint evidenceId,
            bool burnProposal
        )
    {

        Proposal storage p =
            proposals[_proposalId];

        return (
            p.proposalId,
            p.description,
            p.proposer,
            p.deadline,
            p.yesVotes,
            p.noVotes,
            p.executed,
            p.evidenceId,
            p.burnProposal
        );
    }

    function checkIfVoted(
        uint _proposalId,
        address _voter
    )
        public
        view
        returns (bool)
    {

        return hasVoted[_proposalId][_voter];
    }

    function getVoteCounts(
        uint _proposalId
    )
        public
        view
        validProposal(_proposalId)
        returns (
            uint yes,
            uint no
        )
    {

        return (
            proposals[_proposalId].yesVotes,
            proposals[_proposalId].noVotes
        );
    }

    function isVotingActive(
        uint _proposalId
    )
        public
        view
        validProposal(_proposalId)
        returns (bool)
    {

        return (
            block.timestamp <
            proposals[_proposalId].deadline
        );
    }

    // ─────────────────────────────────────────────────────────────
    // ADMIN
    // ─────────────────────────────────────────────────────────────

    /**
     * @dev Update quorum
     */
    function updateQuorum(
        uint _newQuorum
    )
        public
        onlyOwner
    {

        require(
            _newQuorum > 0,
            "Quorum must be > 0"
        );

        quorum = _newQuorum;
    }
}