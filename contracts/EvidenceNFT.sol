// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// OpenZeppelin ERC721 base contract
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title EvidenceNFT
 * @dev ERC-721 token representing ownership of a piece of digital evidence.
 */
contract EvidenceNFT is ERC721, Ownable {

    // ─── State Variables ───────────────────────────────────────────────────────

    /// Address of the EvidenceRegistry contract
    address public registryAddress;

    /// Tracks how many NFTs have been minted
    uint256 public totalMinted;

    // ─── Events ────────────────────────────────────────────────────────────────

    event EvidenceNFTMinted(uint256 indexed tokenId, address indexed to);

    event RegistrySet(address indexed registry);

    // NEW EVENT
    event EvidenceNFTBurned(uint256 indexed tokenId);

    // ─── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlyRegistry() {
        require(
            msg.sender == registryAddress,
            "EvidenceNFT: caller is not the registry"
        );
        _;
    }

    // ─── Constructor ───────────────────────────────────────────────────────────

    constructor()
        ERC721("ChainCustody Evidence", "CCE")
        Ownable(msg.sender)
    {}

    // ─── Admin Functions ───────────────────────────────────────────────────────

    function setRegistry(address _registry) external onlyOwner {
        require(
            _registry != address(0),
            "EvidenceNFT: zero address not allowed"
        );

        registryAddress = _registry;

        emit RegistrySet(_registry);
    }

    // ─── Core Functions ────────────────────────────────────────────────────────

    function mintEvidenceNFT(
        address to,
        uint256 evidenceId
    ) external onlyRegistry returns (uint256) {

        require(
            to != address(0),
            "EvidenceNFT: cannot mint to zero address"
        );

        // evidenceId acts as tokenId
        _safeMint(to, evidenceId);

        totalMinted++;

        emit EvidenceNFTMinted(evidenceId, to);

        return evidenceId;
    }

    function transferEvidenceNFT(
        address from,
        address to,
        uint256 tokenId
    ) external onlyRegistry {

        require(
            to != address(0),
            "EvidenceNFT: cannot transfer to zero address"
        );

        _transfer(from, to, tokenId);
    }

    // ───────────────────────────────────────────────────────────────────────────
    // NEW DAO-GOVERNED BURN FUNCTION
    // ───────────────────────────────────────────────────────────────────────────

    /**
     * @dev Burns an evidence NFT.
     *      ONLY the EvidenceRegistry contract can call this.
     *      DAO cannot burn directly — DAO must go through registry.
     *
     * @param tokenId The NFT / evidence ID to burn
     */
    function burnEvidenceNFT(
        uint256 tokenId
    ) external onlyRegistry {

        // ensure token exists before burn
        require(
            _ownerOf(tokenId) != address(0),
            "EvidenceNFT: token does not exist"
        );

        _burn(tokenId);

        emit EvidenceNFTBurned(tokenId);
    }

    // ─── View Functions ────────────────────────────────────────────────────────

    function getEvidenceOwner(
        uint256 tokenId
    ) external view returns (address) {

        return ownerOf(tokenId);
    }

    function evidenceNFTExists(
        uint256 tokenId
    ) external view returns (bool) {

        try this.ownerOf(tokenId) returns (address owner) {
            return owner != address(0);
        } catch {
            return false;
        }
    }
}