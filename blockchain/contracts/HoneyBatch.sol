// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title HoneyBatch
 * @notice Immutable registry of verified honey batches from Baringo County
 * @dev Only registered cooperatives can record batches. Anyone can read.
 */
contract HoneyBatch is AccessControl {

    // ============================================
    // ROLES
    // ============================================

    bytes32 public constant COOPERATIVE_ROLE = keccak256("COOPERATIVE_ROLE");

    // ============================================
    // DATA STRUCTURES
    // ============================================

    struct Batch {
        string batchId;           // e.g., "BAR-2026-001"
        string village;           // e.g., "Kabarnet"
        string cooperativeName;   // e.g., "Baringo Highlands Honey Cooperative"
        uint256 moistureContent;  // stored as integer: 185 = 18.5%
        uint256 weightKg;         // weight in kilograms
        string harvestDate;       // ISO format: "2026-09-15"
        address verifiedBy;       // cooperative wallet address
        uint256 timestamp;        // block timestamp when recorded
    }

    // ============================================
    // STATE
    // ============================================

    // batchId => Batch
    mapping(string => Batch) private batches;

    // Track all batch IDs
    string[] private allBatchIds;

    // Track which batches a cooperative has recorded
    mapping(address => string[]) private cooperativeBatches;

    // Prevent duplicate batch IDs
    mapping(string => bool) private batchExists;

    // ============================================
    // EVENTS
    // ============================================

    event BatchRecorded(
        string indexed batchId,
        string village,
        string cooperativeName,
        uint256 moistureContent,
        uint256 weightKg,
        address indexed verifiedBy,
        uint256 timestamp
    );

    event CooperativeAdded(address indexed cooperative, string name);

    event CooperativeRemoved(address indexed cooperative);

    // ============================================
    // CONSTRUCTOR
    // ============================================

    constructor() {
        // Deployer becomes admin
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // ============================================
    // ADMIN FUNCTIONS
    // ============================================

    /**
     * @notice Add a cooperative wallet that can record batches
     * @param cooperativeWallet The wallet address of the cooperative
     */
    function addCooperative(address cooperativeWallet)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(cooperativeWallet != address(0), "Invalid wallet address");
        require(
            !hasRole(COOPERATIVE_ROLE, cooperativeWallet),
            "Already a cooperative"
        );

        _grantRole(COOPERATIVE_ROLE, cooperativeWallet);
        emit CooperativeAdded(cooperativeWallet, "");
    }

    /**
     * @notice Remove a cooperative's permission to record batches
     * @param cooperativeWallet The wallet address to remove
     */
    function removeCooperative(address cooperativeWallet)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(
            hasRole(COOPERATIVE_ROLE, cooperativeWallet),
            "Not a cooperative"
        );

        _revokeRole(COOPERATIVE_ROLE, cooperativeWallet);
        emit CooperativeRemoved(cooperativeWallet);
    }

    // ============================================
    // COOPERATIVE FUNCTIONS
    // ============================================

    /**
     * @notice Record a new verified honey batch
     * @dev Only callable by registered cooperatives
     * @param batchId Unique batch identifier
     * @param village Village where harvested
     * @param cooperativeName Name of the cooperative
     * @param moistureContent Moisture content (185 = 18.5%)
     * @param weightKg Weight in kilograms
     * @param harvestDate Harvest date in ISO format
     */
    function recordBatch(
        string memory batchId,
        string memory village,
        string memory cooperativeName,
        uint256 moistureContent,
        uint256 weightKg,
        string memory harvestDate
    ) external onlyRole(COOPERATIVE_ROLE) {
        // Validation
        require(bytes(batchId).length > 0, "Batch ID required");
        require(!batchExists[batchId], "Batch ID already exists");
        require(bytes(village).length > 0, "Village required");
        require(moistureContent > 0 && moistureContent < 1000, "Invalid moisture (0-100%)");
        require(weightKg > 0, "Weight must be positive");

        // Create batch
        Batch memory newBatch = Batch({
            batchId: batchId,
            village: village,
            cooperativeName: cooperativeName,
            moistureContent: moistureContent,
            weightKg: weightKg,
            harvestDate: harvestDate,
            verifiedBy: msg.sender,
            timestamp: block.timestamp
        });

        // Store
        batches[batchId] = newBatch;
        allBatchIds.push(batchId);
        cooperativeBatches[msg.sender].push(batchId);
        batchExists[batchId] = true;

        // Emit event
        emit BatchRecorded(
            batchId,
            village,
            cooperativeName,
            moistureContent,
            weightKg,
            msg.sender,
            block.timestamp
        );
    }

    // ============================================
    // PUBLIC READ FUNCTIONS
    // ============================================

    /**
     * @notice Get details of a specific batch
     * @param batchId The batch identifier
     * @return Batch struct
     */
    function getBatch(string memory batchId)
        external
        view
        returns (Batch memory)
    {
        require(batchExists[batchId], "Batch not found");
        return batches[batchId];
    }

    /**
     * @notice Check if a batch exists
     * @param batchId The batch identifier
     * @return bool
     */
    function batchIdExists(string memory batchId)
        external
        view
        returns (bool)
    {
        return batchExists[batchId];
    }

    /**
     * @notice Get all batch IDs for a cooperative
     * @param cooperative The cooperative wallet address
     * @return string[] of batch IDs
     */
    function getCooperativeBatches(address cooperative)
        external
        view
        returns (string[] memory)
    {
        return cooperativeBatches[cooperative];
    }

    /**
     * @notice Get total number of batches recorded
     * @return uint256 count
     */
    function getTotalBatches() external view returns (uint256) {
        return allBatchIds.length;
    }

    /**
     * @notice Get a batch ID by index
     * @param index The index in allBatchIds
     * @return string batch ID
     */
    function getBatchIdByIndex(uint256 index)
        external
        view
        returns (string memory)
    {
        require(index < allBatchIds.length, "Index out of bounds");
        return allBatchIds[index];
    }
}