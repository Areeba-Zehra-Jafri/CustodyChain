// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// OpenZeppelin ERC721 base contract
// In Remix: this import pulls from OpenZeppelin via HTTPS
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title EvidenceNFT
 * @dev ERC-721 token representing ownership of a piece of digital evidence.
 *      Each token ID corresponds directly to an evidence ID in EvidenceRegistry.
 *
 *      WHO DEPLOYS: Member 2 deploys this.
 *      WHO CALLS:   Only EvidenceRegistry can mint/transfer — enforced by onlyRegistry modifier.
 *
 *      FLOW:
 *        1. Deploy EvidenceNFT → get its address
 *        2. Deploy EvidenceRegistry with that address
 *        3. Call setRegistry(registryAddress) on this contract
 *        4. Now only the registry can mint NFTs
 */
contract EvidenceNFT is ERC721, Ownable {

    // ─── State Variables ───────────────────────────────────────────────────────

    /// Address of the EvidenceRegistry contract — the only address allowed to mint
    address public registryAddress;

    /// Tracks how many NFTs have been minted (also used as next token ID)
    uint256 public totalMinted;

    // ─── Events ────────────────────────────────────────────────────────────────

    /// Emitted when a new evidence NFT is minted
    event EvidenceNFTMinted(uint256 indexed tokenId, address indexed to);

    /// Emitted when registry address is set/updated
    event RegistrySet(address indexed registry);

    // ─── Modifiers ─────────────────────────────────────────────────────────────

    /**
     * @dev Restricts function to only the registered EvidenceRegistry contract.
     *      This prevents anyone from minting NFTs directly — minting only
     *      happens as part of evidence registration.
     */
    modifier onlyRegistry() {
        require(
            msg.sender == registryAddress,
            "EvidenceNFT: caller is not the registry"
        );
        _;
    }

    // ─── Constructor ───────────────────────────────────────────────────────────

    /**
     * @dev Sets up the NFT collection.
     *      Name: "ChainCustody Evidence"
     *      Symbol: "CCE"
     *      The deployer (Member 2's wallet) becomes the owner.
     */
    constructor() ERC721("ChainCustody Evidence", "CCE") Ownable(msg.sender) {}

    // ─── Admin Functions ───────────────────────────────────────────────────────

    /**
     * @dev Sets the EvidenceRegistry address. Only callable by the contract owner.
     *      Must be called AFTER EvidenceRegistry is deployed.
     *
     * @param _registry Address of the deployed EvidenceRegistry contract
     *
     * HOW TO USE IN REMIX:
     *   1. Deploy this contract → copy its address
     *   2. Deploy EvidenceRegistry with this address as constructor arg
     *   3. Come back here → call setRegistry(evidenceRegistryAddress)
     */
    function setRegistry(address _registry) external onlyOwner {
        require(_registry != address(0), "EvidenceNFT: zero address not allowed");
        registryAddress = _registry;
        emit RegistrySet(_registry);
    }

    // ─── Core Functions ────────────────────────────────────────────────────────

    /**
     * @dev Mints a new evidence NFT. Only callable by EvidenceRegistry.
     *      Token ID matches the evidence ID in EvidenceRegistry — this is
     *      intentional so there's a 1:1 mapping.
     *
     * @param to         The wallet address of the initial custodian
     * @param evidenceId The evidence ID (becomes the token ID)
     *
     * @return The minted token ID
     */
    function mintEvidenceNFT(
        address to,
        uint256 evidenceId
    ) external onlyRegistry returns (uint256) {
        require(to != address(0), "EvidenceNFT: cannot mint to zero address");

        // Mint the token — evidenceId IS the tokenId (1:1 mapping)
        _safeMint(to, evidenceId);
        totalMinted++;

        emit EvidenceNFTMinted(evidenceId, to);
        return evidenceId;
    }

    /**
     * @dev Transfers an evidence NFT when custody changes.
     *      Only callable by EvidenceRegistry to keep transfers controlled.
     *      EvidenceRegistry validates ownership before calling this.
     *
     * @param from       Current owner (current custodian)
     * @param to         New owner (new custodian)
     * @param tokenId    The evidence ID / token ID
     */
    function transferEvidenceNFT(
        address from,
        address to,
        uint256 tokenId
    ) external onlyRegistry {
        require(to != address(0), "EvidenceNFT: cannot transfer to zero address");
        // _transfer bypasses the approval check — safe here because
        // EvidenceRegistry already validates ownership
        _transfer(from, to, tokenId);
    }

    // ─── View Functions ────────────────────────────────────────────────────────

    /**
     * @dev Returns who owns a specific evidence NFT.
     *      Inherited from ERC721, exposed here for clarity.
     *
     * @param tokenId The evidence ID to look up
     * @return Address of the current owner
     */
    function getEvidenceOwner(uint256 tokenId) external view returns (address) {
        return ownerOf(tokenId);
    }

    /**
     * @dev Checks if a token (evidence NFT) exists.
     *
     * @param tokenId The evidence ID to check
     * @return True if the NFT has been minted
     */
    function evidenceNFTExists(uint256 tokenId) external view returns (bool) {
        // ownerOf reverts on non-existent token, so we use try/catch logic
        // ERC721 stores owners in _owners mapping — check if non-zero
        try this.ownerOf(tokenId) returns (address owner) {
            return owner != address(0);
        } catch {
            return false;
        }
    }
}
