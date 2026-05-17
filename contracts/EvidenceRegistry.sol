// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Import our own NFT contract
import "./EvidenceNFT.sol";

/**
 * @title EvidenceRegistry
 * @dev Core smart contract for the ChainCustody digital evidence system.
 *
 *      WHAT THIS DOES:
 *        - Registers digital evidence by storing its SHA-256 hash on-chain
 *        - Prevents duplicate evidence (same hash can't be registered twice)
 *        - Verifies evidence integrity by comparing stored vs provided hash
 *        - Tracks full chain of custody (every person who held the evidence)
 *        - Mints an ERC-721 NFT to the registrant representing ownership
 *        - Transfers NFT ownership when custody changes
 *
 *      MEMBER 1 owns this file.
 *      MEMBER 2 deploys this after EvidenceNFT is deployed.
 *      MEMBER 3 connects this to the frontend via Ethers.js + ABI.
 */
contract EvidenceRegistry {

    // ─── Data Structures ──────────────────────────────────────────────────────

    /**
     * @dev Represents a single piece of digital evidence.
     *      All fields are stored permanently on the blockchain.
     *
     * Fields:
     *   evidenceId      — auto-incremented unique ID (starts at 1)
     *   hash            — SHA-256 hash of the file (computed off-chain by frontend)
     *   caseId          — the case this evidence belongs to (e.g. "CASE-2024-001")
     *   evidenceType    — type descriptor (e.g. "image", "video", "document")
     *   description     — free-text description of the evidence
     *   timestamp       — block timestamp when registered (Unix seconds)
     *   currentCustodian — wallet address of whoever currently holds custody
     *   isRegistered    — flag to quickly check if an ID is valid
     */
    struct Evidence {
        uint256 evidenceId;
        bytes32 hash;
        string caseId;
        string evidenceType;
        string description;
        uint256 timestamp;
        address currentCustodian;
        bool isRegistered;
    }

    // ─── State Variables ───────────────────────────────────────────────────────

    /// Reference to the NFT contract — set in constructor
    EvidenceNFT public evidenceNFT;

    /// Auto-incrementing evidence ID counter. Starts at 1 (0 means "not found")
    uint256 public evidenceCounter;

    /// Primary evidence storage: evidenceId → Evidence struct
    mapping(uint256 => Evidence) public evidences;

    /// Duplicate prevention: hash → already registered?
    /// bytes32 is the type for SHA-256 hashes
    mapping(bytes32 => bool) public hashExists;

    /**
     * @dev Full custody trail for each evidence item.
     *      evidenceId → array of all custodian addresses (chronological order)
     *      Index 0 = original registrant, last index = current custodian
     *
     *      Example after 2 transfers:
     *        [0x111..., 0x222..., 0x333...]
     *                              ^ current custodian
     */
    mapping(uint256 => address[]) public custodyTrail;

    // ─── Events ────────────────────────────────────────────────────────────────

    /**
     * @dev Fired when new evidence is registered.
     *      Frontend listens to this to confirm successful registration.
     */
    event EvidenceRegistered(
        uint256 indexed evidenceId,
        bytes32 indexed hash,
        string caseId,
        string evidenceType,
        address indexed custodian,
        uint256 timestamp
    );

    /**
     * @dev Fired when custody is transferred to a new wallet.
     *      Frontend listens to this to update custody trail display.
     */
    event CustodyTransferred(
        uint256 indexed evidenceId,
        address indexed from,
        address indexed to,
        uint256 timestamp
    );

    /**
     * @dev Fired when integrity is verified.
     *      Records every verification attempt on-chain for audit trail.
     */
    event IntegrityVerified(
        uint256 indexed evidenceId,
        bool isIntact,
        address indexed verifiedBy,
        uint256 timestamp
    );

    // ─── Modifiers ─────────────────────────────────────────────────────────────

    /**
     * @dev Ensures the caller is the current custodian of the evidence.
     *      Used on transferCustody — only the current holder can transfer.
     *
     * @param evidenceId The evidence to check ownership of
     */
    modifier onlyCustodian(uint256 evidenceId) {
        require(
            evidences[evidenceId].isRegistered,
            "EvidenceRegistry: evidence does not exist"
        );
        require(
            evidences[evidenceId].currentCustodian == msg.sender,
            "EvidenceRegistry: caller is not the current custodian"
        );
        _;
    }

    /**
     * @dev Ensures the given evidence ID exists in the registry.
     *
     * @param evidenceId The evidence ID to validate
     */
    modifier validEvidence(uint256 evidenceId) {
        require(
            evidences[evidenceId].isRegistered,
            "EvidenceRegistry: evidence not found"
        );
        _;
    }

    // ─── Constructor ───────────────────────────────────────────────────────────

    /**
     * @dev Links this registry to the already-deployed EvidenceNFT contract.
     *
     * @param _nftAddress Address of the deployed EvidenceNFT contract
     *
     * HOW TO DEPLOY IN REMIX:
     *   1. First deploy EvidenceNFT.sol → copy the deployed address
     *   2. Paste that address as _nftAddress when deploying this contract
     *   3. After this deploys, go back to EvidenceNFT → call setRegistry(thisAddress)
     */
    constructor(address _nftAddress) {
        require(_nftAddress != address(0), "EvidenceRegistry: invalid NFT address");
        evidenceNFT = EvidenceNFT(_nftAddress);
        evidenceCounter = 0;
    }

    // ─── Core Functions ────────────────────────────────────────────────────────

    /**
     * @dev Registers a new piece of digital evidence on the blockchain.
     *
     *      WHAT HAPPENS:
     *        1. Validates that inputs are not empty
     *        2. Checks the hash hasn't been registered before (duplicate prevention)
     *        3. Assigns a new evidence ID
     *        4. Stores the Evidence struct
     *        5. Records caller as first custodian in the trail
     *        6. Marks the hash as used
     *        7. Mints an NFT to the caller
     *        8. Emits EvidenceRegistered event
     *
     *      CALLED BY: Frontend (Member 3) after computing SHA-256 of the file
     *
     * @param hash          SHA-256 hash of the evidence file (as bytes32)
     * @param caseId        Case identifier string
     * @param evidenceType  Type of evidence (image/video/document/etc.)
     * @param description   Human-readable description of the evidence
     *
     * @return newId   The newly assigned evidence ID
     */
    function registerEvidence(
        bytes32 hash,
        string calldata caseId,
        string calldata evidenceType,
        string calldata description
    ) external returns (uint256 newId) {
        // Validate inputs
        require(hash != bytes32(0), "EvidenceRegistry: hash cannot be empty");
        require(bytes(caseId).length > 0, "EvidenceRegistry: caseId cannot be empty");
        require(bytes(evidenceType).length > 0, "EvidenceRegistry: evidenceType cannot be empty");

        // Prevent registering the same file twice
        require(!hashExists[hash], "EvidenceRegistry: this hash is already registered");

        // Assign new ID (1-indexed)
        evidenceCounter++;
        newId = evidenceCounter;

        // Store the evidence
        evidences[newId] = Evidence({
            evidenceId: newId,
            hash: hash,
            caseId: caseId,
            evidenceType: evidenceType,
            description: description,
            timestamp: block.timestamp,
            currentCustodian: msg.sender,
            isRegistered: true
        });

        // Record in custody trail — caller is the first custodian
        custodyTrail[newId].push(msg.sender);

        // Mark hash as used (prevents re-registration)
        hashExists[hash] = true;

        // Mint NFT to the registrant — token ID = evidence ID
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
     * @dev Verifies whether a file's current hash matches the registered hash.
     *      This is how tampering is detected — if the file was modified,
     *      its SHA-256 hash will be different.
     *
     *      WHAT HAPPENS:
     *        1. Looks up the stored hash for this evidence ID
     *        2. Compares it with the provided hash (recomputed by frontend)
     *        3. Returns true (intact) or false (tampered)
     *        4. Emits IntegrityVerified for on-chain audit trail
     *
     *      CALLED BY: Frontend (Member 3) when user uploads file to verify
     *
     * @param evidenceId    The ID of the evidence to verify
     * @param currentHash   The SHA-256 hash of the file being checked (as bytes32)
     *
     * @return isIntact     True if hashes match (not tampered), false otherwise
     */
    function verifyIntegrity(
        uint256 evidenceId,
        bytes32 currentHash
    ) external validEvidence(evidenceId) returns (bool isIntact) {
        require(currentHash != bytes32(0), "EvidenceRegistry: hash cannot be empty");

        // Compare stored hash vs provided hash
        isIntact = (evidences[evidenceId].hash == currentHash);

        emit IntegrityVerified(evidenceId, isIntact, msg.sender, block.timestamp);

        return isIntact;
    }

    /**
     * @dev Transfers custody of evidence to a new custodian.
     *      Only the current custodian can call this.
     *
     *      WHAT HAPPENS:
     *        1. Modifier confirms caller is current custodian
     *        2. Validates new custodian address
     *        3. Updates currentCustodian in the struct
     *        4. Appends new custodian to custody trail
     *        5. Transfers the NFT to the new custodian
     *        6. Emits CustodyTransferred event
     *
     *      CALLED BY: Frontend (Member 3) when user clicks "Transfer Custody"
     *
     * @param evidenceId    The ID of the evidence to transfer
     * @param newCustodian  Wallet address of the new custodian
     */
    function transferCustody(
        uint256 evidenceId,
        address newCustodian
    ) external onlyCustodian(evidenceId) {
        require(newCustodian != address(0), "EvidenceRegistry: cannot transfer to zero address");
        require(
            newCustodian != msg.sender,
            "EvidenceRegistry: cannot transfer to yourself"
        );

        address previousCustodian = evidences[evidenceId].currentCustodian;

        // Update the current custodian in storage
        evidences[evidenceId].currentCustodian = newCustodian;

        // Append to custody trail (preserves history)
        custodyTrail[evidenceId].push(newCustodian);

        // Transfer the NFT to match custody
        evidenceNFT.transferEvidenceNFT(previousCustodian, newCustodian, evidenceId);

        emit CustodyTransferred(
            evidenceId,
            previousCustodian,
            newCustodian,
            block.timestamp
        );
    }

    // ─── View / Read Functions ─────────────────────────────────────────────────
    // These are FREE to call (no gas) — useful for frontend display

    /**
     * @dev Returns all stored data for a specific evidence item.
     *
     * @param evidenceId The evidence ID to look up
     * @return The full Evidence struct
     */
    function getEvidence(
        uint256 evidenceId
    ) external view validEvidence(evidenceId) returns (Evidence memory) {
        return evidences[evidenceId];
    }

    /**
     * @dev Returns the complete custody trail for an evidence item.
     *      First address = original registrant
     *      Last address = current custodian
     *
     * @param evidenceId The evidence ID to look up
     * @return Array of all custodian addresses in chronological order
     */
    function getCustodyTrail(
        uint256 evidenceId
    ) external view validEvidence(evidenceId) returns (address[] memory) {
        return custodyTrail[evidenceId];
    }

    /**
     * @dev Returns the current custodian of an evidence item.
     *      Shortcut — frontend can call this instead of getEvidence().
     *
     * @param evidenceId The evidence ID to check
     * @return Address of the current custodian
     */
    function getCurrentCustodian(
        uint256 evidenceId
    ) external view validEvidence(evidenceId) returns (address) {
        return evidences[evidenceId].currentCustodian;
    }

    /**
     * @dev Checks whether a hash has already been registered.
     *      Frontend can call this BEFORE registerEvidence to warn the user.
     *
     * @param hash The SHA-256 hash to check (as bytes32)
     * @return True if already registered, false if new
     */
    function isHashRegistered(bytes32 hash) external view returns (bool) {
        return hashExists[hash];
    }

    /**
     * @dev Returns how many evidence items have been registered in total.
     *      Useful for the frontend to display a count.
     *
     * @return Total number of registered evidence items
     */
    function getTotalEvidence() external view returns (uint256) {
        return evidenceCounter;
    }
}
