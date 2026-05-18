/* ═══════════════════════════════════════════════════════════
   ChainCustody — app.js
   Member 3 Deliverable: MetaMask + Ethers.js + SHA-256 + UI
   ═══════════════════════════════════════════════════════════
   UPDATED: New contract addresses + ABIs from updated Solidity
   ═══════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────
//  CONTRACT ADDRESSES  ✓ Updated from DeploymentRecord (1).txt
// ─────────────────────────────────────────────

const CONTRACT_ADDRESSES = {
  evidenceRegistry: "0x82Cc4e46943C5a52BF6Fa472019CAF250703A997",
  evidenceNFT:      "0x5D8bA40977166572e543500df7bF2abb1d558C01",
  custodyDAO:       "0x10d981b9B49d1C73d7CeE474FC73468Bbf597478",
};

// ─────────────────────────────────────────────
//  ABIs — Built directly from updated Solidity source code
// ─────────────────────────────────────────────

const EVIDENCE_REGISTRY_ABI = [
  // ── Core Write Functions ──
  "function registerEvidence(bytes32 hash, string calldata caseId, string calldata evidenceType, string calldata description) external returns (uint256)",
  "function verifyIntegrity(uint256 evidenceId, bytes32 currentHash) external returns (bool)",
  "function transferCustody(uint256 evidenceId, address newCustodian) external",
  "function burnEvidence(uint256 evidenceId) external",   // called by DAO only — included for completeness

  // ── Admin ──
  "function setDAO(address _daoAddress) external",

  // ── View / Read Functions ──
  "function getEvidence(uint256 evidenceId) external view returns (tuple(uint256 evidenceId, bytes32 hash, string caseId, string evidenceType, string description, uint256 timestamp, address currentCustodian, bool isRegistered, bool isBurned))",
  "function getCustodyTrail(uint256 evidenceId) external view returns (address[] memory)",
  "function getCurrentCustodian(uint256 evidenceId) external view returns (address)",
  "function isHashRegistered(bytes32 hash) external view returns (bool)",
  "function getTotalEvidence() external view returns (uint256)",
  "function evidenceCounter() external view returns (uint256)",
  "function daoAddress() external view returns (address)",

  // ── Events ──
  "event EvidenceRegistered(uint256 indexed evidenceId, bytes32 indexed hash, string caseId, string evidenceType, address indexed custodian, uint256 timestamp)",
  "event CustodyTransferred(uint256 indexed evidenceId, address indexed from, address indexed to, uint256 timestamp)",
  "event IntegrityVerified(uint256 indexed evidenceId, bool isIntact, address indexed verifiedBy, uint256 timestamp)",
  "event EvidenceBurned(uint256 indexed evidenceId, address indexed burnedBy, uint256 timestamp)",
];

const CUSTODY_DAO_ABI = [
  // ── Core Write Functions ──
  // createBurnProposal replaces the old createProposal
  // Takes: description, durationInMinutes, evidenceId
  "function createBurnProposal(string memory _description, uint _durationInMinutes, uint _evidenceId) public returns (uint)",
  "function vote(uint _proposalId, bool _support) public",
  "function executeProposal(uint _proposalId) public",

  // ── View / Read Functions ──
  // getProposal now returns 9 fields (added evidenceId + burnProposal)
  "function getProposal(uint _proposalId) public view returns (uint id, string memory description, address proposer, uint deadline, uint yesVotes, uint noVotes, bool executed, uint evidenceId, bool burnProposal)",
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
  "event EvidenceBurnExecuted(uint indexed proposalId, uint indexed evidenceId)",
];

// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────

let provider = null;
let signer   = null;
let registryContract = null;
let daoContract      = null;

let currentHash  = null;
let currentFile  = null;
let currentHash2 = null;

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

    await window.ethereum.request({ method: "eth_requestAccounts" });

    provider = new ethers.BrowserProvider(window.ethereum);
    signer   = await provider.getSigner();

    const address    = await signer.getAddress();
    const balance    = await provider.getBalance(address);
    const balanceEth = ethers.formatEther(balance);

    // Check network (Sepolia = 11155111)
    const network = await provider.getNetwork();
    if (network.chainId !== 11155111n) {
      showToast("Switching to Sepolia testnet...", "error");
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0xaa36a7" }],
        });
        location.reload();
      } catch (_) {
        showToast("Please switch to Sepolia manually in MetaMask.", "error");
      }
      return;
    }

    // Init contracts
    registryContract = new ethers.Contract(CONTRACT_ADDRESSES.evidenceRegistry, EVIDENCE_REGISTRY_ABI, signer);
    daoContract      = new ethers.Contract(CONTRACT_ADDRESSES.custodyDAO,       CUSTODY_DAO_ABI,       signer);

    // Update UI
    const shortAddr = address.slice(0, 6) + "..." + address.slice(-4);
    document.getElementById("walletAddress").textContent = address;
    document.getElementById("walletBalance").textContent = parseFloat(balanceEth).toFixed(4) + " ETH";
    document.getElementById("statusBar").style.display   = "flex";

    const btn = document.getElementById("connectBtn");
    btn.textContent = shortAddr;
    btn.classList.add("connected");

    hideTxResult("registerResult");
    showToast("Wallet connected: " + shortAddr, "success");

    if (currentHash) document.getElementById("registerBtn").disabled = false;

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
//  SHA-256 HASHING
// ─────────────────────────────────────────────

async function computeSHA256(file) {
  const buffer     = await file.arrayBuffer();
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

  document.getElementById("fileInfo").style.display  = "block";
  document.getElementById("fileName").textContent    = file.name;
  document.getElementById("fileSize").textContent    = formatBytes(file.size);
  document.getElementById("fileType").textContent    = file.type || "unknown";
  document.getElementById("hashBox").style.display   = "block";
  document.getElementById("hashSpinner").style.display = "inline-block";
  document.getElementById("hashStatusText").textContent = "Computing SHA-256...";
  document.getElementById("hashOutput").textContent  = "—";
  document.getElementById("hashField").value         = "";
  document.getElementById("registerBtn").disabled    = true;

  try {
    const hash = await computeSHA256(file);
    currentHash = hash;

    document.getElementById("hashOutput").textContent      = hash;
    document.getElementById("hashField").value             = hash;
    document.getElementById("hashSpinner").style.display   = "none";
    document.getElementById("hashStatusText").textContent  = "✓ Hash computed successfully";

    if (signer) document.getElementById("registerBtn").disabled = false;
    showToast("SHA-256 hash computed successfully.", "success");

  } catch (err) {
    document.getElementById("hashSpinner").style.display  = "none";
    document.getElementById("hashStatusText").textContent = "✗ Hashing failed";
    showToast("Hashing error: " + err.message, "error");
  }
}

async function onFile2Selected(file) {
  document.getElementById("hashBox2").style.display   = "block";
  document.getElementById("hashOutput2").textContent  = "Computing...";
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

  zone.addEventListener("click",    () => input.click());
  input.addEventListener("change",  () => { if (input.files[0]) onFileSelected(input.files[0]); });
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("dragover"); });
  zone.addEventListener("dragleave",() => zone.classList.remove("dragover"));
  zone.addEventListener("drop",     (e) => {
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
  const desc         = document.getElementById("evidenceDesc").value.trim() || "No description provided";

  if (!caseId)       return showToast("Please enter a Case ID.", "error");
  if (!evidenceType) return showToast("Please select an evidence type.", "error");

  try {
    showTxResult("registerResult", "loading", "Checking for duplicates...");
    document.getElementById("registerBtn").disabled = true;

    const hashBytes32 = ethers.zeroPadValue(currentHash, 32);

    // Pre-check duplicate
    const alreadyExists = await registryContract.isHashRegistered(hashBytes32);
    if (alreadyExists) {
      showTxResult("registerResult", "error", "✗ This file has already been registered on-chain.");
      showToast("Duplicate file detected!", "error");
      document.getElementById("registerBtn").disabled = false;
      return;
    }

    showTxResult("registerResult", "loading", "Sending transaction to blockchain...");
    const tx = await registryContract.registerEvidence(hashBytes32, caseId, evidenceType, desc);
    showTxResult("registerResult", "loading", "Transaction sent. Waiting for confirmation...\nTx: " + tx.hash);

    const receipt = await tx.wait();

    // Extract Evidence ID from EvidenceRegistered event
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
    // Confirm ID exists
    const total = await registryContract.getTotalEvidence();
    if (BigInt(evidenceId) > total) {
      return showToast("Evidence ID " + evidenceId + " does not exist.", "error");
    }

    const ev = await registryContract.getEvidence(BigInt(evidenceId));

    // Check if evidence was burned — new field in updated contract
    const isBurned = ev.isBurned !== undefined ? ev.isBurned : ev[8];
    if (isBurned) {
      result.style.display = "block";
      result.className = "verify-result mismatch";
      document.getElementById("verifyIcon").textContent   = "🔥";
      document.getElementById("verifyStatus").textContent = "EVIDENCE BURNED";
      document.getElementById("verifyDetail").textContent = "This evidence has been destroyed by DAO vote and cannot be verified.";
      showToast("Evidence has been burned!", "error");
      return;
    }

    // Get stored hash
    let storedHash = ev.hash || ev[1];
    if (typeof storedHash !== "string") storedHash = ethers.hexlify(storedHash);
    storedHash = storedHash.toLowerCase();

    // Recompute with same zeroPadValue used during registration
    const recomputedHash = ethers.zeroPadValue(currentHash2, 32).toLowerCase();

    console.log("Stored hash:     ", storedHash);
    console.log("Recomputed hash: ", recomputedHash);

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
      document.getElementById("verifyDetail").textContent =
        "Hash does NOT match. Stored: " + storedHash.slice(0,20) + "... | Got: " + recomputedHash.slice(0,20) + "...";
      showToast("Hash mismatch! Evidence may be tampered.", "error");
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
    // Struct now has 9 fields: evidenceId, hash, caseId, evidenceType, description,
    //                          timestamp, currentCustodian, isRegistered, isBurned

    const isBurned = ev.isBurned !== undefined ? ev.isBurned : ev[8];

    document.getElementById("ev-caseId").textContent    = ev.caseId       || ev[2] || "—";
    document.getElementById("ev-type").textContent      = ev.evidenceType || ev[3] || "—";
    document.getElementById("ev-custodian").textContent = isBurned ? "🔥 BURNED" : (ev.currentCustodian || ev[6] || "—");
    document.getElementById("ev-time").textContent      = (ev.timestamp || ev[5])
      ? new Date(Number(ev.timestamp || ev[5]) * 1000).toLocaleString() : "—";

    document.getElementById("evidenceCard").style.display = "block";

    // Disable transfer button if burned
    document.getElementById("transferBtn").disabled = !!isBurned;
    if (isBurned) showToast("This evidence has been burned by DAO vote.", "error");

    loadCustodyTrail(evidenceId);

  } catch (err) {
    showToast("Could not fetch evidence: " + (err.reason || err.message), "error");
  }
}

async function loadCustodyTrail(evidenceId) {
  try {
    const addresses = await registryContract.getCustodyTrail(BigInt(evidenceId));
    const trailEl   = document.getElementById("custodyTrail");
    trailEl.innerHTML = "";

    addresses.forEach((addr, i) => {
      const item  = document.createElement("div");
      item.className = "trail-item";
      const label = i === 0 ? "Registered by" : i === addresses.length - 1 ? "Current" : "Transferred to";
      item.innerHTML = `
        <span class="trail-addr">#${i+1} ${label}: ${addr.slice(0,6)}...${addr.slice(-4)}</span>
        <span class="trail-time" title="${addr}">${addr}</span>
      `;
      trailEl.appendChild(item);
    });

    document.getElementById("trailSection").style.display = addresses.length > 0 ? "block" : "none";

  } catch (_) {}
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

  const callerAddress = await signer.getAddress();
  if (newCustodian.toLowerCase() === callerAddress.toLowerCase()) {
    return showToast("Cannot transfer custody to yourself.", "error");
  }

  try {
    showTxResult("transferResult", "loading", "Initiating custody transfer...");
    document.getElementById("transferBtn").disabled = true;

    const tx      = await registryContract.transferCustody(BigInt(evidenceId), newCustodian);
    showTxResult("transferResult", "loading", "Transaction sent. Waiting...\nTx: " + tx.hash);

    const receipt = await tx.wait();
    showTxResult("transferResult", "success",
      "✓ Custody transferred successfully!\n" +
      "Tx Hash: " + receipt.hash + "\n" +
      "Block: " + receipt.blockNumber
    );
    showToast("Custody transferred!", "success");
    document.getElementById("transferBtn").disabled = false;
    fetchEvidence();

  } catch (err) {
    const msg = err.reason || err.message || "Transfer failed";
    showTxResult("transferResult", "error", "✗ " + msg);
    showToast("Transfer failed.", "error");
    document.getElementById("transferBtn").disabled = false;
  }
}

// ─────────────────────────────────────────────
//  DAO — CREATE BURN PROPOSAL
//  CHANGED: createProposal → createBurnProposal
//  CHANGED: now takes 3 params (description, durationInMinutes, evidenceId)
// ─────────────────────────────────────────────

async function createProposal() {
  if (!signer) return showToast("Connect your wallet first.", "error");

  const description = document.getElementById("proposalDesc").value.trim();
  const deadlineHrs = parseInt(document.getElementById("votingDeadline").value) || 48;
  const durationMins = BigInt(deadlineHrs * 60);

  // evidenceId to burn — read from the UI field
  const evidenceIdRaw = document.getElementById("proposalEvidenceId")
    ? document.getElementById("proposalEvidenceId").value.trim()
    : "0";
  const evidenceId = BigInt(evidenceIdRaw || "0");

  if (!description) return showToast("Enter a proposal description.", "error");
  if (deadlineHrs < 1) return showToast("Voting deadline must be at least 1 hour.", "error");
  if (evidenceId <= 0n) return showToast("Enter the Evidence ID to burn.", "error");

  try {
    showTxResult("proposalResult", "loading", "Creating burn proposal on-chain...");
    document.getElementById("createProposalBtn").disabled = true;

    // NEW FUNCTION: createBurnProposal(description, durationInMinutes, evidenceId)
    const tx = await daoContract.createBurnProposal(description, durationMins, evidenceId);
    showTxResult("proposalResult", "loading", "Sent. Waiting for confirmation...\nTx: " + tx.hash);

    const receipt = await tx.wait();
    showTxResult("proposalResult", "success",
      "✓ Burn proposal created!\n" +
      "Tx Hash: " + receipt.hash + "\n" +
      "Block: " + receipt.blockNumber
    );
    showToast("Burn proposal created successfully!", "success");
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
//  CHANGED: getProposal now returns 9 fields (added evidenceId + burnProposal)
// ─────────────────────────────────────────────

async function fetchProposal() {
  if (!signer) return showToast("Connect your wallet first.", "error");

  const proposalId = document.getElementById("voteProposalId").value;
  if (!proposalId) return showToast("Enter a Proposal ID.", "error");

  try {
    const p = await daoContract.getProposal(BigInt(proposalId));
    // Returns: (id, description, proposer, deadline, yesVotes, noVotes, executed, evidenceId, burnProposal)
    // Index:     0       1          2         3          4         5        6         7           8

    const yes      = Number(p[4]);
    const no       = Number(p[5]);
    const total    = yes + no || 1;
    const deadline = new Date(Number(p[3]) * 1000);
    const isOpen   = deadline > new Date() && !p[6];
    const evId     = Number(p[7]);
    const isBurn   = p[8];

    document.getElementById("prop-desc").textContent = p[1] || "—";
    document.getElementById("yesCount").textContent  = yes;
    document.getElementById("noCount").textContent   = no;
    document.getElementById("yesFill").style.width   = Math.round((yes / total) * 100) + "%";
    document.getElementById("noFill").style.width    = Math.round((no  / total) * 100) + "%";

    // Show extra info if available in UI
    const extraEl = document.getElementById("prop-extra");
    if (extraEl) {
      extraEl.textContent = isBurn
        ? `🔥 Burn Proposal — Evidence ID: ${evId}`
        : "General Proposal";
    }

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

    const tx      = await daoContract.vote(BigInt(proposalId), support);
    showTxResult("voteResult", "loading", "Sent. Waiting...\nTx: " + tx.hash);

    const receipt = await tx.wait();
    showTxResult("voteResult", "success",
      "✓ Vote cast: " + (support ? "YES" : "NO") + "\n" +
      "Tx Hash: " + receipt.hash
    );
    showToast("Vote recorded on-chain!", "success");
    fetchProposal();

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
//  Now executeProposal actually calls burnEvidence() on-chain if passed
// ─────────────────────────────────────────────

async function executeProposal() {
  if (!signer) return showToast("Connect your wallet first.", "error");

  const proposalId = document.getElementById("voteProposalId").value;
  if (!proposalId) return showToast("Enter a Proposal ID.", "error");

  try {
    showTxResult("voteResult", "loading", "Executing proposal verdict...");

    const tx      = await daoContract.executeProposal(BigInt(proposalId));
    const receipt = await tx.wait();

    // Check for EvidenceBurnExecuted event
    let burnMsg = "";
    try {
      const iface = daoContract.interface;
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed && parsed.name === "EvidenceBurnExecuted") {
            burnMsg = "\n🔥 Evidence ID " + parsed.args[1].toString() + " has been burned!";
            break;
          }
        } catch (_) {}
      }
    } catch (_) {}

    showTxResult("voteResult", "success",
      "✓ Proposal executed!" + burnMsg + "\nTx Hash: " + receipt.hash
    );
    showToast(burnMsg ? "Evidence burned by DAO!" : "Verdict executed!", "success");
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
  el.className     = "tx-result " + type;
  if (type === "loading") {
    el.innerHTML = `<span class="spinner"></span>${message}`;
  } else {
    el.textContent = message;
  }
}

function hideTxResult(id) {
  document.getElementById(id).style.display = "none";
}

let toastTimer = null;
function showToast(message, type = "info") {
  const toast    = document.getElementById("toast");
  toast.textContent = message;
  toast.className   = "toast show " + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 4000);
}

function formatBytes(bytes) {
  if (bytes < 1024)    return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(2) + " MB";
}