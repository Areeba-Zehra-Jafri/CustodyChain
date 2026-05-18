// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Import our own NFT contract
import "./EvidenceNFT.sol";

// OpenZeppelin Ownable for admin access control
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title EvidenceRegistry
 * @dev Core smart contract for the ChainCustody digital evidence system.
 *
 * FEATURES:
 *  - Register digital evidence
 *  - Store SHA-256 hashes on-chain
 *  - Prevent duplicate evidence
 *  - Verify integrity
 *  - Transfer custody
 *  - Maintain custody trail
 *  - Mint ERC721 NFTs
 *  - DAO-controlled evidence burn
 */

contract EvidenceRegistry is Ownable {

    // ─────────────────────────────────────────────────────────────
    // DATA STRUCTURES
    // ─────────────────────────────────────────────────────────────

    struct Evidence {
        uint256 evidenceId;
        bytes32 hash;
        string caseId;
        string evidenceType;
        string description;
        uint256 timestamp;
        address currentCustodian;
        bool isRegistered;
        bool isBurned;
    }

    // ─────────────────────────────────────────────────────────────
    // STATE VARIABLES
    // ─────────────────────────────────────────────────────────────

    /// NFT contract reference
    EvidenceNFT public evidenceNFT;

    /// DAO contract address
    address public daoAddress;

    /// Auto-increment evidence ID counter
    uint256 public evidenceCounter;

    /// evidenceId => Evidence
    mapping(uint256 => Evidence) public evidences;

    /// hash => exists
    mapping(bytes32 => bool) public hashExists;

    /// evidenceId => custody trail
    mapping(uint256 => address[]) public custodyTrail;

    // ─────────────────────────────────────────────────────────────
    // EVENTS
    // ─────────────────────────────────────────────────────────────

    event EvidenceRegistered(
        uint256 indexed evidenceId,
        bytes32 indexed hash,
        string caseId,
        string evidenceType,
        address indexed custodian,
        uint256 timestamp
    );

    event CustodyTransferred(
        uint256 indexed evidenceId,
        address indexed from,
        address indexed to,
        uint256 timestamp
    );

    event IntegrityVerified(
        uint256 indexed evidenceId,
        bool isIntact,
        address indexed verifiedBy,
        uint256 timestamp
    );

    event EvidenceBurned(
        uint256 indexed evidenceId,
        address indexed burnedBy,
        uint256 timestamp
    );

    event DAOAddressSet(address indexed daoAddress);

    // ─────────────────────────────────────────────────────────────
    // MODIFIERS
    // ─────────────────────────────────────────────────────────────

    modifier onlyCustodian(uint256 evidenceId) {
        require(
            evidences[evidenceId].isRegistered,
            "EvidenceRegistry: evidence does not exist"
        );

        require(
            !evidences[evidenceId].isBurned,
            "EvidenceRegistry: evidence is burned"
        );

        require(
            evidences[evidenceId].currentCustodian == msg.sender,
            "EvidenceRegistry: caller is not current custodian"
        );

        _;
    }

    modifier validEvidence(uint256 evidenceId) {
        require(
            evidences[evidenceId].isRegistered,
            "EvidenceRegistry: evidence not found"
        );

        _;
    }

    modifier onlyDAO() {
        require(
            msg.sender == daoAddress,
            "EvidenceRegistry: caller is not DAO"
        );

        _;
    }

    // ─────────────────────────────────────────────────────────────
    // CONSTRUCTOR
    // ─────────────────────────────────────────────────────────────

    constructor(address _nftAddress) Ownable(msg.sender) {

        require(
            _nftAddress != address(0),
            "EvidenceRegistry: invalid NFT address"
        );

        evidenceNFT = EvidenceNFT(_nftAddress);

        evidenceCounter = 0;
    }

    // ─────────────────────────────────────────────────────────────
    // ADMIN FUNCTIONS
    // ─────────────────────────────────────────────────────────────

    /**
     * @dev Sets DAO contract address
     * Only owner can set this
     */
    function setDAO(address _daoAddress) external onlyOwner {

        require(
            _daoAddress != address(0),
            "EvidenceRegistry: invalid DAO address"
        );

        daoAddress = _daoAddress;

        emit DAOAddressSet(_daoAddress);
    }

    // ─────────────────────────────────────────────────────────────
    // CORE FUNCTIONS
    // ─────────────────────────────────────────────────────────────

    /**
     * @dev Register new evidence
     */
    function registerEvidence(
        bytes32 hash,
        string calldata caseId,
        string calldata evidenceType,
        string calldata description
    ) external returns (uint256 newId) {

        require(
            hash != bytes32(0),
            "EvidenceRegistry: hash cannot be empty"
        );

        require(
            bytes(caseId).length > 0,
            "EvidenceRegistry: caseId cannot be empty"
        );

        require(
            bytes(evidenceType).length > 0,
            "EvidenceRegistry: evidenceType cannot be empty"
        );

        // Duplicate prevention
        require(
            !hashExists[hash],
            "EvidenceRegistry: hash already registered"
        );

        // Increment ID
        evidenceCounter++;

        newId = evidenceCounter;

        // Store evidence
        evidences[newId] = Evidence({
            evidenceId: newId,
            hash: hash,
            caseId: caseId,
            evidenceType: evidenceType,
            description: description,
            timestamp: block.timestamp,
            currentCustodian: msg.sender,
            isRegistered: true,
            isBurned: false
        });

        // Add first custodian
        custodyTrail[newId].push(msg.sender);

        // Mark hash as used
        hashExists[hash] = true;

        // Mint NFT
        evidenceNFT.mintEvidenceNFT(msg.sender, newId);

        emit EvidenceRegistered(
            newId,
            hash,
            caseId,
            evidenceType,
            msg.sender,
            block.timestamp
        );

        return newId;
    }

    /**
     * @dev Verify integrity of evidence
     */
    function verifyIntegrity(
        uint256 evidenceId,
        bytes32 currentHash
    )
        external
        validEvidence(evidenceId)
        returns (bool isIntact)
    {

        require(
            !evidences[evidenceId].isBurned,
            "EvidenceRegistry: evidence is burned"
        );

        require(
            currentHash != bytes32(0),
            "EvidenceRegistry: hash cannot be empty"
        );

        isIntact = (
            evidences[evidenceId].hash == currentHash
        );

        emit IntegrityVerified(
            evidenceId,
            isIntact,
            msg.sender,
            block.timestamp
        );

        return isIntact;
    }

    /**
     * @dev Transfer custody
     */
    function transferCustody(
        uint256 evidenceId,
        address newCustodian
    )
        external
        onlyCustodian(evidenceId)
    {

        require(
            newCustodian != address(0),
            "EvidenceRegistry: zero address"
        );

        require(
            newCustodian != msg.sender,
            "EvidenceRegistry: cannot transfer to yourself"
        );

        address previousCustodian =
            evidences[evidenceId].currentCustodian;

        // Update current custodian
        evidences[evidenceId].currentCustodian =
            newCustodian;

        // Append trail
        custodyTrail[evidenceId].push(newCustodian);

        // Transfer NFT
        evidenceNFT.transferEvidenceNFT(
            previousCustodian,
            newCustodian,
            evidenceId
        );

        emit CustodyTransferred(
            evidenceId,
            previousCustodian,
            newCustodian,
            block.timestamp
        );
    }

    /**
     * @dev DAO-approved evidence burn
     * ONLY DAO can call this
     */
    function burnEvidence(
        uint256 evidenceId
    )
        external
        validEvidence(evidenceId)
        onlyDAO
    {

        require(
            !evidences[evidenceId].isBurned,
            "EvidenceRegistry: evidence already burned"
        );

        // Mark evidence as burned
        evidences[evidenceId].isBurned = true;

        // Burn NFT
        evidenceNFT.burnEvidenceNFT(evidenceId);

        emit EvidenceBurned(
            evidenceId,
            msg.sender,
            block.timestamp
        );
    }

    // ─────────────────────────────────────────────────────────────
    // VIEW FUNCTIONS
    // ─────────────────────────────────────────────────────────────

    function getEvidence(
        uint256 evidenceId
    )
        external
        view
        validEvidence(evidenceId)
        returns (Evidence memory)
    {
        return evidences[evidenceId];
    }

    function getCustodyTrail(
        uint256 evidenceId
    )
        external
        view
        validEvidence(evidenceId)
        returns (address[] memory)
    {
        return custodyTrail[evidenceId];
    }

    function getCurrentCustodian(
        uint256 evidenceId
    )
        external
        view
        validEvidence(evidenceId)
        returns (address)
    {
        return evidences[evidenceId].currentCustodian;
    }

    function isHashRegistered(
        bytes32 hash
    )
        external
        view
        returns (bool)
    {
        return hashExists[hash];
    }

    function getTotalEvidence()
        external
        view
        returns (uint256)
    {
        return evidenceCounter;
    }
}