/* ═══════════════════════════════════════════════════════════
   ChainCustody — app.js
   Member 3 Deliverable: MetaMask + Ethers.js + SHA-256 + UI
   ═══════════════════════════════════════════════════════════

   HOW TO USE:
   1. After your teammates deploy contracts on Sepolia,
      replace the placeholder addresses + ABIs below.
   2. Open index.html in a browser with MetaMask installed.
   3. Click "Connect MetaMask" and you're live.
   ═══════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────
//  CONTRACT ADDRESSES  ✓ CONFIGURED (DeploymentRecord.txt)
//  ⚠  ABI arrays below still need to be pasted from Remix
// ─────────────────────────────────────────────

const CONTRACT_ADDRESSES = {
  evidenceRegistry: "0xecdfb085e815e67081dA9B4b8715C606289f5139",
  evidenceNFT:      "0x95c15b1Ac2C61BFcA5e60267C9fDFc910CBcFCc9",
  custodyDAO:       "0x68D4824dab88A331Cdb4d53D0d215e6ADe85E1D9",
};

// ✓ ABIs built directly from Solidity source code (Member 1 + Member 2 contracts)
const EVIDENCE_REGISTRY_ABI = [
  // ── Core Write Functions ──
  "function registerEvidence(bytes32 hash, string calldata caseId, string calldata evidenceType, string calldata description) external returns (uint256)",
  "function verifyIntegrity(uint256 evidenceId, bytes32 currentHash) external returns (bool)",
  "function transferCustody(uint256 evidenceId, address newCustodian) external",

  // ── View / Read Functions (free, no gas) ──
  "function getEvidence(uint256 evidenceId) external view returns (tuple(uint256 evidenceId, bytes32 hash, string caseId, string evidenceType, string description, uint256 timestamp, address currentCustodian, bool isRegistered))",
  "function getCustodyTrail(uint256 evidenceId) external view returns (address[] memory)",
  "function getCurrentCustodian(uint256 evidenceId) external view returns (address)",
  "function isHashRegistered(bytes32 hash) external view returns (bool)",
  "function getTotalEvidence() external view returns (uint256)",
  "function evidenceCounter() external view returns (uint256)",

  // ── Events ──
  "event EvidenceRegistered(uint256 indexed evidenceId, bytes32 indexed hash, string caseId, string evidenceType, address indexed custodian, uint256 timestamp)",
  "event CustodyTransferred(uint256 indexed evidenceId, address indexed from, address indexed to, uint256 timestamp)",
  "event IntegrityVerified(uint256 indexed evidenceId, bool isIntact, address indexed verifiedBy, uint256 timestamp)",
];

const CUSTODY_DAO_ABI = [
  // ── Core Write Functions ──
  "function createProposal(string memory _description, uint _durationInMinutes) public returns (uint)",
  "function vote(uint _proposalId, bool _support) public",
  "function executeProposal(uint _proposalId) public",

  // ── View / Read Functions (free, no gas) ──
  "function getProposal(uint _proposalId) public view returns (uint id, string memory description, address proposer, uint deadline, uint yesVotes, uint noVotes, bool executed)",
  "function getVoteCounts(uint _proposalId) public view returns (uint yes, uint no)",
  "function checkIfVoted(uint _proposalId, address _voter) public view returns (bool)",
  "function isVotingActive(uint _proposalId) public view returns (bool)",
  "function proposalCount() public view returns (uint)",
  "function quorum() public view returns (uint)",

  // ── Admin ──
  "function updateQuorum(uint _newQuorum) public",

  // ── Events ──
  "event ProposalCreated(uint indexed proposalId, address indexed proposer, string description, uint deadline)",
  "event Voted(uint indexed proposalId, address indexed voter, bool support)",
  "event ProposalExecuted(uint indexed proposalId, bool passed)",
];

// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────

let provider = null;
let signer   = null;
let registryContract = null;
let daoContract      = null;

let currentHash  = null;   // hex string from SHA-256
let currentFile  = null;   // File object
let currentHash2 = null;   // for verify tab

// ─────────────────────────────────────────────
//  ETHERS.JS  (loaded from CDN via <script>)
//  We use ethers v6 syntax. Add this to index.html:
//  <script src="https://cdnjs.cloudflare.com/ajax/libs/ethers/6.7.0/ethers.umd.min.js"></script>
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  setupDropZone("dropZone",  "fileInput",  onFile1Selected);
  setupDropZone("dropZone2", "fileInput2", onFile2Selected);
  setupButtons();
  checkIfAlreadyConnected();
});

// ─────────────────────────────────────────────
//  METAMASK CONNECTION
// ─────────────────────────────────────────────

async function connectWallet() {
  if (typeof window.ethereum === "undefined") {
    showToast("MetaMask not found. Please install the MetaMask extension.", "error");
    return;
  }

  try {
    showTxResult("registerResult", "loading", "Connecting to MetaMask...");

    // Request account access
    await window.ethereum.request({ method: "eth_requestAccounts" });

    provider = new ethers.BrowserProvider(window.ethereum);
    signer   = await provider.getSigner();

    const address = await signer.getAddress();
    const balance = await provider.getBalance(address);
    const balanceEth = ethers.formatEther(balance);

    // Check network (Sepolia = chainId 11155111)
    const network = await provider.getNetwork();
    if (network.chainId !== 11155111n) {
      showToast("Switching to Sepolia testnet...", "error");
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0xaa36a7" }],
        });
        // After switching, reload to reinitialize everything cleanly
        location.reload();
      } catch (_) {
        showToast("Please switch to Sepolia manually in MetaMask.", "error");
      }
      return;
    }

    // Init contracts
    registryContract = new ethers.Contract(CONTRACT_ADDRESSES.evidenceRegistry, EVIDENCE_REGISTRY_ABI, signer);
    daoContract      = new ethers.Contract(CONTRACT_ADDRESSES.custodyDAO, CUSTODY_DAO_ABI, signer);

    // Update UI
    const shortAddr = address.slice(0, 6) + "..." + address.slice(-4);
    document.getElementById("walletAddress").textContent = address;
    document.getElementById("walletBalance").textContent = parseFloat(balanceEth).toFixed(4) + " ETH";
    document.getElementById("statusBar").style.display = "flex";

    const btn = document.getElementById("connectBtn");
    btn.textContent = shortAddr;
    btn.classList.add("connected");

    hideTxResult("registerResult");
    showToast("Wallet connected: " + shortAddr, "success");

    // Enable register button if hash ready
    if (currentHash) document.getElementById("registerBtn").disabled = false;

    // Listen for account changes
    window.ethereum.on("accountsChanged", () => location.reload());
    window.ethereum.on("chainChanged",    () => location.reload());

  } catch (err) {
    hideTxResult("registerResult");
    showToast("Connection failed: " + (err.message || err), "error");
  }
}

async function checkIfAlreadyConnected() {
  if (typeof window.ethereum === "undefined") return;
  try {
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    if (accounts.length > 0) connectWallet();
  } catch (_) {}
}

// ─────────────────────────────────────────────
//  SHA-256 HASHING (SubtleCrypto — no library needed)
// ─────────────────────────────────────────────

async function computeSHA256(file) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray  = Array.from(new Uint8Array(hashBuffer));
  const hashHex    = "0x" + hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

// ─────────────────────────────────────────────
//  FILE HANDLERS
// ─────────────────────────────────────────────

async function onFile1Selected(file) {
  currentFile = file;
  currentHash = null;

  // Show file info
  document.getElementById("fileInfo").style.display = "block";
  document.getElementById("fileName").textContent = file.name;
  document.getElementById("fileSize").textContent = formatBytes(file.size);
  document.getElementById("fileType").textContent = file.type || "unknown";

  // Show hash box with spinner
  document.getElementById("hashBox").style.display = "block";
  document.getElementById("hashSpinner").style.display = "inline-block";
  document.getElementById("hashStatusText").textContent = "Computing SHA-256...";
  document.getElementById("hashOutput").textContent = "—";
  document.getElementById("hashField").value = "";
  document.getElementById("registerBtn").disabled = true;

  try {
    const hash = await computeSHA256(file);
    currentHash = hash;

    document.getElementById("hashOutput").textContent = hash;
    document.getElementById("hashField").value = hash;
    document.getElementById("hashSpinner").style.display = "none";
    document.getElementById("hashStatusText").textContent = "✓ Hash computed successfully";

    if (signer) document.getElementById("registerBtn").disabled = false;
    showToast("SHA-256 hash computed successfully.", "success");

  } catch (err) {
    document.getElementById("hashSpinner").style.display = "none";
    document.getElementById("hashStatusText").textContent = "✗ Hashing failed";
    showToast("Hashing error: " + err.message, "error");
  }
}

async function onFile2Selected(file) {
  document.getElementById("hashBox2").style.display = "block";
  document.getElementById("hashOutput2").textContent = "Computing...";
  currentHash2 = null;

  try {
    const hash = await computeSHA256(file);
    currentHash2 = hash;
    document.getElementById("hashOutput2").textContent = hash;
  } catch (err) {
    document.getElementById("hashOutput2").textContent = "Error: " + err.message;
  }
}

// ─────────────────────────────────────────────
//  DROP ZONE SETUP
// ─────────────────────────────────────────────

function setupDropZone(zoneId, inputId, onFileSelected) {
  const zone  = document.getElementById(zoneId);
  const input = document.getElementById(inputId);

  zone.addEventListener("click", () => input.click());

  input.addEventListener("change", () => {
    if (input.files[0]) onFileSelected(input.files[0]);
  });

  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("dragover");
  });

  zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));

  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("dragover");
    if (e.dataTransfer.files[0]) onFileSelected(e.dataTransfer.files[0]);
  });
}

// ─────────────────────────────────────────────
//  REGISTER EVIDENCE
// ─────────────────────────────────────────────

async function registerEvidence() {
  if (!signer)      return showToast("Connect your wallet first.", "error");
  if (!currentHash) return showToast("Upload a file first to generate the hash.", "error");

  const caseId       = document.getElementById("caseId").value.trim();
  const evidenceType = document.getElementById("evidenceType").value;

  if (!caseId)       return showToast("Please enter a Case ID.", "error");
  if (!evidenceType) return showToast("Please select an evidence type.", "error");

  try {
    showTxResult("registerResult", "loading", "Checking for duplicates...");
    document.getElementById("registerBtn").disabled = true;

    const hashBytes32 = currentHash; // Already 32-byte hex from SHA-256

    // Pre-check: warn user if this file was already registered (saves gas)
    const alreadyExists = await registryContract.isHashRegistered(ethers.zeroPadValue(currentHash, 32));
    if (alreadyExists) {
      showTxResult("registerResult", "error", "✗ This file has already been registered on-chain. Each file can only be registered once.");
      showToast("Duplicate file detected!", "error");
      document.getElementById("registerBtn").disabled = false;
      return;
    }

    showTxResult("registerResult", "loading", "Sending transaction to blockchain...");
    const desc = document.getElementById("evidenceDesc").value.trim() || "No description provided";
    const tx = await registryContract.registerEvidence(hashBytes32, caseId, evidenceType, desc);

    showTxResult("registerResult", "loading", "Transaction sent. Waiting for confirmation...\nTx: " + tx.hash);

    const receipt = await tx.wait();

    // Extract evidence ID from emitted event
    let evidenceId = "—";
    try {
      const iface = registryContract.interface;
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed && parsed.name === "EvidenceRegistered") {
            evidenceId = parsed.args[0].toString();
            break;
          }
        } catch (_) {}
      }
    } catch (_) {}

    showTxResult("registerResult", "success",
      "✓ Evidence registered successfully!\n" +
      "Evidence ID: " + evidenceId + "\n" +
      "Tx Hash: " + receipt.hash + "\n" +
      "Block: " + receipt.blockNumber
    );

    showToast("Evidence registered on Sepolia!", "success");
    document.getElementById("registerBtn").disabled = false;

  } catch (err) {
    const msg = err.reason || err.message || "Transaction failed";
    showTxResult("registerResult", "error", "✗ " + msg);
    showToast("Registration failed.", "error");
    document.getElementById("registerBtn").disabled = false;
  }
}

// ─────────────────────────────────────────────
//  VERIFY INTEGRITY
// ─────────────────────────────────────────────

async function verifyIntegrity() {
  if (!signer)       return showToast("Connect your wallet first.", "error");
  if (!currentHash2) return showToast("Upload the evidence file first.", "error");

  const evidenceId = document.getElementById("verifyEvidenceId").value;
  if (!evidenceId)   return showToast("Enter the Evidence ID.", "error");

  const result = document.getElementById("verifyResult");
  result.style.display = "none";

  try {
    // Fetch the stored evidence from blockchain using individual fields
    // Use evidenceCounter to confirm ID exists first
    const total = await registryContract.getTotalEvidence();
    if (BigInt(evidenceId) > total) {
      return showToast("Evidence ID " + evidenceId + " does not exist.", "error");
    }

    // Get stored hash directly via mapping — more reliable than getEvidence struct
    const ev = await registryContract.getEvidence(BigInt(evidenceId));

    // With tuple ABI, ethers returns named fields — access by name
    // ev.hash = bytes32 stored hash
    let storedHash = ev.hash || ev[1];
    if (typeof storedHash !== "string") {
      storedHash = ethers.hexlify(storedHash);
    }
    storedHash = storedHash.toLowerCase();

    // Convert recomputed hash the EXACT same way as during registration
    const recomputedHash = ethers.zeroPadValue(currentHash2, 32).toLowerCase();

    console.log("Stored hash:     ", storedHash);
    console.log("Recomputed hash: ", recomputedHash);

    // Compare — both are now properly padded 32-byte hex strings
    const isVerified = (storedHash === recomputedHash);

    result.style.display = "block";
    if (isVerified) {
      result.className = "verify-result verified";
      document.getElementById("verifyIcon").textContent   = "✓";
      document.getElementById("verifyStatus").textContent = "VERIFIED";
      document.getElementById("verifyDetail").textContent = "Hash matches the on-chain record. Evidence is intact.";
      showToast("Evidence integrity verified!", "success");
    } else {
      result.className = "verify-result mismatch";
      document.getElementById("verifyIcon").textContent   = "✗";
      document.getElementById("verifyStatus").textContent = "HASH MISMATCH";
      document.getElementById("verifyDetail").textContent = "Hash does NOT match. Stored: " + storedHash.slice(0,20) + "... | Got: " + recomputedHash.slice(0,20) + "...";
      showToast("Hash mismatch detected! Evidence may be tampered.", "error");
    }

  } catch (err) {
    console.error("Verify error:", err);
    showToast("Verification failed: " + (err.reason || err.message || "Unknown error"), "error");
  }
}

// ─────────────────────────────────────────────
//  FETCH EVIDENCE DETAILS
// ─────────────────────────────────────────────

async function fetchEvidence() {
  if (!signer) return showToast("Connect your wallet first.", "error");

  const evidenceId = document.getElementById("transferEvidenceId").value;
  if (!evidenceId) return showToast("Enter an Evidence ID.", "error");

  try {
    const ev = await registryContract.getEvidence(BigInt(evidenceId));
    // Returns: (evidenceId, hash, caseId, evidenceType, description, timestamp, currentCustodian, isRegistered)

    // Access by name (tuple) with index fallback
    document.getElementById("ev-caseId").textContent    = ev.caseId    || ev[2] || "—";
    document.getElementById("ev-type").textContent      = ev.evidenceType || ev[3] || "—";
    document.getElementById("ev-custodian").textContent = ev.currentCustodian || ev[6] || "—";
    document.getElementById("ev-time").textContent      = (ev.timestamp || ev[5])
      ? new Date(Number(ev.timestamp || ev[5]) * 1000).toLocaleString() : "—";
    document.getElementById("evidenceCard").style.display = "block";

    // Also load custody trail
    loadCustodyTrail(evidenceId);

  } catch (err) {
    showToast("Could not fetch evidence: " + (err.reason || err.message), "error");
  }
}

async function loadCustodyTrail(evidenceId) {
  try {
    const addresses = await registryContract.getCustodyTrail(BigInt(evidenceId));
    const trailEl = document.getElementById("custodyTrail");
    trailEl.innerHTML = "";

    addresses.forEach((addr, i) => {
      const item = document.createElement("div");
      item.className = "trail-item";
      const label = i === 0 ? "Registered by" : i === addresses.length - 1 ? "Current" : "Transferred to";
      item.innerHTML = `
        <span class="trail-addr">#${i+1} ${label}: ${addr.slice(0,6)}...${addr.slice(-4)}</span>
        <span class="trail-time" title="${addr}">${addr}</span>
      `;
      trailEl.appendChild(item);
    });

    document.getElementById("trailSection").style.display = addresses.length > 0 ? "block" : "none";

  } catch (_) {
    // getCustodyTrail optional — skip silently
  }
}

// ─────────────────────────────────────────────
//  TRANSFER CUSTODY
// ─────────────────────────────────────────────

async function transferCustody() {
  if (!signer) return showToast("Connect your wallet first.", "error");

  const evidenceId   = document.getElementById("transferEvidenceId").value;
  const newCustodian = document.getElementById("newCustodian").value.trim();

  if (!evidenceId)   return showToast("Enter an Evidence ID.", "error");
  if (!newCustodian) return showToast("Enter the new custodian's wallet address.", "error");
  if (!ethers.isAddress(newCustodian)) return showToast("Invalid wallet address.", "error");
  
  // Check caller is not transferring to themselves
  const callerAddress = await signer.getAddress();
  if (newCustodian.toLowerCase() === callerAddress.toLowerCase()) {
    return showToast("Cannot transfer custody to yourself.", "error");
  }

  try {
    showTxResult("transferResult", "loading", "Initiating custody transfer...");
    document.getElementById("transferBtn").disabled = true;

    const tx = await registryContract.transferCustody(BigInt(evidenceId), newCustodian);
    showTxResult("transferResult", "loading", "Transaction sent. Waiting...\nTx: " + tx.hash);

    const receipt = await tx.wait();
    showTxResult("transferResult", "success",
      "✓ Custody transferred successfully!\n" +
      "Tx Hash: " + receipt.hash + "\n" +
      "Block: " + receipt.blockNumber
    );

    showToast("Custody transferred!", "success");
    document.getElementById("transferBtn").disabled = false;
    fetchEvidence(); // Refresh

  } catch (err) {
    const msg = err.reason || err.message || "Transfer failed";
    showTxResult("transferResult", "error", "✗ " + msg);
    showToast("Transfer failed.", "error");
    document.getElementById("transferBtn").disabled = false;
  }
}

// ─────────────────────────────────────────────
//  DAO — CREATE PROPOSAL
// ─────────────────────────────────────────────

async function createProposal() {
  if (!signer) return showToast("Connect your wallet first.", "error");

  const description  = document.getElementById("proposalDesc").value.trim();
  const deadlineHrs  = parseInt(document.getElementById("votingDeadline").value) || 48;
  // Contract takes durationInMinutes — convert hours to minutes
  const durationMins = BigInt(deadlineHrs * 60);

  if (!description) return showToast("Enter a proposal description.", "error");
  if (deadlineHrs < 1) return showToast("Voting deadline must be at least 1 hour.", "error");

  try {
    showTxResult("proposalResult", "loading", "Creating proposal on-chain...");
    document.getElementById("createProposalBtn").disabled = true;

    const tx = await daoContract.createProposal(description, durationMins);
    showTxResult("proposalResult", "loading", "Sent. Waiting for confirmation...\nTx: " + tx.hash);

    const receipt = await tx.wait();
    showTxResult("proposalResult", "success",
      "✓ Proposal created!\n" +
      "Tx Hash: " + receipt.hash + "\n" +
      "Block: " + receipt.blockNumber
    );

    showToast("Proposal created successfully!", "success");
    document.getElementById("createProposalBtn").disabled = false;
    document.getElementById("proposalDesc").value = "";

  } catch (err) {
    const msg = err.reason || err.message || "Failed";
    showTxResult("proposalResult", "error", "✗ " + msg);
    showToast("Proposal creation failed.", "error");
    document.getElementById("createProposalBtn").disabled = false;
  }
}

// ─────────────────────────────────────────────
//  DAO — FETCH PROPOSAL
// ─────────────────────────────────────────────

async function fetchProposal() {
  if (!signer) return showToast("Connect your wallet first.", "error");

  const proposalId = document.getElementById("voteProposalId").value;
  if (!proposalId) return showToast("Enter a Proposal ID.", "error");

  try {
    const p = await daoContract.getProposal(BigInt(proposalId));
    // Returns: (id, description, proposer, deadline, yesVotes, noVotes, executed)
    // Index:     0       1          2         3          4         5        6

    const yes = Number(p[4]);
    const no  = Number(p[5]);
    const total = yes + no || 1;
    const deadline = new Date(Number(p[3]) * 1000);
    const isOpen   = deadline > new Date() && !p[6];

    document.getElementById("prop-desc").textContent = p[1] || "—";
    document.getElementById("yesCount").textContent  = yes;
    document.getElementById("noCount").textContent   = no;
    document.getElementById("yesFill").style.width   = Math.round((yes / total) * 100) + "%";
    document.getElementById("noFill").style.width    = Math.round((no  / total) * 100) + "%";

    const statusEl = document.getElementById("propStatus");
    if (p[6]) {
      statusEl.textContent = "EXECUTED";
      statusEl.className   = "prop-status-badge executed";
    } else if (isOpen) {
      statusEl.textContent = "OPEN · Closes " + deadline.toLocaleString();
      statusEl.className   = "prop-status-badge open";
    } else {
      statusEl.textContent = "CLOSED";
      statusEl.className   = "prop-status-badge closed";
    }

    document.getElementById("proposalCard").style.display = "block";

  } catch (err) {
    showToast("Could not fetch proposal: " + (err.reason || err.message), "error");
  }
}

// ─────────────────────────────────────────────
//  DAO — VOTE
// ─────────────────────────────────────────────

async function castVote(support) {
  if (!signer) return showToast("Connect your wallet first.", "error");

  const proposalId = document.getElementById("voteProposalId").value;
  if (!proposalId) return showToast("Enter a Proposal ID.", "error");

  try {
    showTxResult("voteResult", "loading", "Submitting vote...");
    document.getElementById("voteYesBtn").disabled = true;
    document.getElementById("voteNoBtn").disabled  = true;

    const tx = await daoContract.vote(BigInt(proposalId), support);
    showTxResult("voteResult", "loading", "Sent. Waiting...\nTx: " + tx.hash);

    const receipt = await tx.wait();
    showTxResult("voteResult", "success",
      "✓ Vote cast: " + (support ? "YES" : "NO") + "\n" +
      "Tx Hash: " + receipt.hash
    );

    showToast("Vote recorded on-chain!", "success");
    fetchProposal(); // Refresh vote counts

  } catch (err) {
    const msg = err.reason || err.message || "Vote failed";
    showTxResult("voteResult", "error", "✗ " + msg);
    showToast("Vote failed.", "error");
  } finally {
    document.getElementById("voteYesBtn").disabled = false;
    document.getElementById("voteNoBtn").disabled  = false;
  }
}

// ─────────────────────────────────────────────
//  DAO — EXECUTE VERDICT
// ─────────────────────────────────────────────

async function executeProposal() {
  if (!signer) return showToast("Connect your wallet first.", "error");

  const proposalId = document.getElementById("voteProposalId").value;
  if (!proposalId) return showToast("Enter a Proposal ID.", "error");

  try {
    showTxResult("voteResult", "loading", "Executing proposal verdict...");

    const tx = await daoContract.executeProposal(BigInt(proposalId));
    const receipt = await tx.wait();

    showTxResult("voteResult", "success",
      "✓ Proposal executed!\nTx Hash: " + receipt.hash
    );

    showToast("Verdict executed!", "success");
    fetchProposal();

  } catch (err) {
    const msg = err.reason || err.message || "Execution failed";
    showTxResult("voteResult", "error", "✗ " + msg);
    showToast("Execution failed.", "error");
  }
}

// ─────────────────────────────────────────────
//  BUTTON SETUP
// ─────────────────────────────────────────────

function setupButtons() {
  document.getElementById("connectBtn").addEventListener("click", connectWallet);
  document.getElementById("registerBtn").addEventListener("click", registerEvidence);
  document.getElementById("verifyBtn").addEventListener("click", verifyIntegrity);
  document.getElementById("fetchEvidenceBtn").addEventListener("click", fetchEvidence);
  document.getElementById("transferBtn").addEventListener("click", transferCustody);
  document.getElementById("createProposalBtn").addEventListener("click", createProposal);
  document.getElementById("fetchProposalBtn").addEventListener("click", fetchProposal);
  document.getElementById("voteYesBtn").addEventListener("click", () => castVote(true));
  document.getElementById("voteNoBtn").addEventListener("click",  () => castVote(false));
  document.getElementById("executeBtn").addEventListener("click", executeProposal);
}

// ─────────────────────────────────────────────
//  TAB NAVIGATION
// ─────────────────────────────────────────────

function setupTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
  const panels  = document.querySelectorAll(".tab-panel");

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      buttons.forEach(b => b.classList.remove("active"));
      panels.forEach(p  => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    });
  });
}

// ─────────────────────────────────────────────
//  UI HELPERS
// ─────────────────────────────────────────────

function showTxResult(id, type, message) {
  const el = document.getElementById(id);
  el.style.display = "block";
  el.className = "tx-result " + type;

  if (type === "loading") {
    el.innerHTML = `<span class="spinner"></span>${message}`;
  } else {
    el.textContent = message;
  }
}

function hideTxResult(id) {
  const el = document.getElementById(id);
  el.style.display = "none";
}

let toastTimer = null;
function showToast(message, type = "info") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className   = "toast show " + type;

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 4000);
}

function formatBytes(bytes) {
  if (bytes < 1024)       return bytes + " B";
  if (bytes < 1048576)    return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(2) + " MB";
}