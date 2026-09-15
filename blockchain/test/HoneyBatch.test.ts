import { expect } from "chai";
import { ethers } from "hardhat";
import { HoneyBatch } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("HoneyBatch", function () {
  let contract: HoneyBatch;
  let admin: SignerWithAddress;
  let cooperative: SignerWithAddress;
  let buyer: SignerWithAddress;

  beforeEach(async function () {
    [admin, cooperative, buyer] = await ethers.getSigners();

    const HoneyBatchFactory = await ethers.getContractFactory("HoneyBatch");
    contract = await HoneyBatchFactory.deploy();
    await contract.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set deployer as admin", async function () {
      const ADMIN_ROLE = await contract.DEFAULT_ADMIN_ROLE();
      expect(await contract.hasRole(ADMIN_ROLE, admin.address)).to.be.true;
    });

    it("Should have zero batches initially", async function () {
      expect(await contract.getTotalBatches()).to.equal(0);
    });
  });

  describe("Cooperative Management", function () {
    it("Should allow admin to add a cooperative", async function () {
      await expect(contract.addCooperative(cooperative.address))
        .to.emit(contract, "CooperativeAdded")
        .withArgs(cooperative.address, "");

      const COOP_ROLE = await contract.COOPERATIVE_ROLE();
      expect(await contract.hasRole(COOP_ROLE, cooperative.address)).to.be.true;
    });

    it("Should reject non-admin trying to add cooperative", async function () {
      await expect(
        contract.connect(cooperative).addCooperative(buyer.address)
      ).to.be.reverted;
    });

    it("Should reject adding a cooperative twice", async function () {
      await contract.addCooperative(cooperative.address);
      await expect(
        contract.addCooperative(cooperative.address)
      ).to.be.revertedWith("Already a cooperative");
    });

    it("Should allow admin to remove a cooperative", async function () {
      await contract.addCooperative(cooperative.address);
      await expect(contract.removeCooperative(cooperative.address))
        .to.emit(contract, "CooperativeRemoved")
        .withArgs(cooperative.address);

      const COOP_ROLE = await contract.COOPERATIVE_ROLE();
      expect(await contract.hasRole(COOP_ROLE, cooperative.address)).to.be.false;
    });
  });

  describe("Recording Batches", function () {
    beforeEach(async function () {
      await contract.addCooperative(cooperative.address);
    });

    it("Should allow cooperative to record a batch", async function () {
      await expect(
        contract
          .connect(cooperative)
          .recordBatch(
            "BAR-2026-001",
            "Kabarnet",
            "Baringo Highlands Honey Cooperative",
            185,
            120,
            "2026-09-15"
          )
      ).to.emit(contract, "BatchRecorded");

      expect(await contract.getTotalBatches()).to.equal(1);
    });

    it("Should store batch details correctly", async function () {
      await contract
        .connect(cooperative)
        .recordBatch(
          "BAR-2026-001",
          "Kabarnet",
          "Baringo Highlands Honey Cooperative",
          185,
          120,
          "2026-09-15"
        );

      const batch = await contract.getBatch("BAR-2026-001");
      expect(batch.batchId).to.equal("BAR-2026-001");
      expect(batch.village).to.equal("Kabarnet");
      expect(batch.cooperativeName).to.equal(
        "Baringo Highlands Honey Cooperative"
      );
      expect(batch.moistureContent).to.equal(185);
      expect(batch.weightKg).to.equal(120);
      expect(batch.harvestDate).to.equal("2026-09-15");
      expect(batch.verifiedBy).to.equal(cooperative.address);
    });

    it("Should reject non-cooperative recording a batch", async function () {
      await expect(
        contract
          .connect(buyer)
          .recordBatch(
            "BAR-2026-001",
            "Kabarnet",
            "Fake Cooperative",
            185,
            120,
            "2026-09-15"
          )
      ).to.be.reverted;
    });

    it("Should reject duplicate batch ID", async function () {
      await contract
        .connect(cooperative)
        .recordBatch("BAR-2026-001", "Kabarnet", "Coop", 185, 120, "2026-09-15");

      await expect(
        contract
          .connect(cooperative)
          .recordBatch(
            "BAR-2026-001",
            "Kabarnet",
            "Coop",
            185,
            120,
            "2026-09-15"
          )
      ).to.be.revertedWith("Batch ID already exists");
    });

    it("Should reject empty batch ID", async function () {
      await expect(
        contract.connect(cooperative).recordBatch("", "Kabarnet", "Coop", 185, 120, "2026-09-15")
      ).to.be.revertedWith("Batch ID required");
    });

    it("Should reject invalid moisture content", async function () {
      await expect(
        contract
          .connect(cooperative)
          .recordBatch(
            "BAR-2026-002",
            "Kabarnet",
            "Coop",
            1200,
            120,
            "2026-09-15"
          )
      ).to.be.revertedWith("Invalid moisture (0-100%)");
    });

    it("Should reject zero weight", async function () {
      await expect(
        contract
          .connect(cooperative)
          .recordBatch(
            "BAR-2026-003",
            "Kabarnet",
            "Coop",
            185,
            0,
            "2026-09-15"
          )
      ).to.be.revertedWith("Weight must be positive");
    });
  });

  describe("Reading Batches", function () {
    beforeEach(async function () {
      await contract.addCooperative(cooperative.address);
      await contract
        .connect(cooperative)
        .recordBatch("BAR-2026-001", "Kabarnet", "Coop A", 185, 120, "2026-09-15");
      await contract
        .connect(cooperative)
        .recordBatch("BAR-2026-002", "Marigat", "Coop A", 175, 80, "2026-09-16");
    });

    it("Should return total batches count", async function () {
      expect(await contract.getTotalBatches()).to.equal(2);
    });

    it("Should return cooperative's batches", async function () {
      const batches = await contract.getCooperativeBatches(cooperative.address);
      expect(batches.length).to.equal(2);
      expect(batches[0]).to.equal("BAR-2026-001");
      expect(batches[1]).to.equal("BAR-2026-002");
    });

    it("Should return batch by index", async function () {
      expect(await contract.getBatchIdByIndex(0)).to.equal("BAR-2026-001");
      expect(await contract.getBatchIdByIndex(1)).to.equal("BAR-2026-002");
    });

    it("Should revert for non-existent batch", async function () {
      await expect(contract.getBatch("NON-EXISTENT")).to.be.revertedWith(
        "Batch not found"
      );
    });

    it("Should allow anyone to check batch existence", async function () {
      expect(await contract.batchIdExists("BAR-2026-001")).to.be.true;
      expect(await contract.batchIdExists("NON-EXISTENT")).to.be.false;
    });
  });
});