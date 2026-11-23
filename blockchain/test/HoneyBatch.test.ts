import { expect } from "chai";
import { ethers } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { HoneyBatch } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("HoneyBatch v2", function () {
  let contract: HoneyBatch;
  let admin: SignerWithAddress;
  let cooperative: SignerWithAddress;
  let buyer: SignerWithAddress;

  const lotIdsHash = ethers.keccak256(
    ethers.toUtf8Bytes("64b64c2f3f3f3f3f3f3f3f3f\n74b64c2f3f3f3f3f3f3f3f3f")
  );
  const secondLotIdsHash = ethers.keccak256(
    ethers.toUtf8Bytes("84b64c2f3f3f3f3f3f3f3f3f")
  );

  beforeEach(async function () {
    [admin, cooperative, buyer] = await ethers.getSigners();

    const HoneyBatchFactory = await ethers.getContractFactory("HoneyBatch");
    contract = await HoneyBatchFactory.deploy();
    await contract.waitForDeployment();
  });

  describe("Deployment", function () {
    it("sets the deployer as admin and central cooperative relayer", async function () {
      const adminRole = await contract.DEFAULT_ADMIN_ROLE();
      const cooperativeRole = await contract.COOPERATIVE_ROLE();

      expect(await contract.hasRole(adminRole, admin.address)).to.be.true;
      expect(await contract.hasRole(cooperativeRole, admin.address)).to.be.true;
    });

    it("starts with zero batches", async function () {
      expect(await contract.getTotalBatches()).to.equal(0);
    });
  });

  describe("Cooperative Management", function () {
    it("allows the admin to add a cooperative", async function () {
      await expect(contract.addCooperative(cooperative.address))
        .to.emit(contract, "CooperativeAdded")
        .withArgs(cooperative.address, "");

      const cooperativeRole = await contract.COOPERATIVE_ROLE();
      expect(await contract.hasRole(cooperativeRole, cooperative.address)).to.be.true;
    });

    it("rejects a non-admin adding a cooperative", async function () {
      await expect(
        contract.connect(cooperative).addCooperative(buyer.address)
      ).to.be.reverted;
    });

    it("rejects adding a cooperative twice", async function () {
      await contract.addCooperative(cooperative.address);
      await expect(
        contract.addCooperative(cooperative.address)
      ).to.be.revertedWith("Already a cooperative");
    });

    it("allows the admin to remove a cooperative", async function () {
      await contract.addCooperative(cooperative.address);
      await expect(contract.removeCooperative(cooperative.address))
        .to.emit(contract, "CooperativeRemoved")
        .withArgs(cooperative.address);

      const cooperativeRole = await contract.COOPERATIVE_ROLE();
      expect(await contract.hasRole(cooperativeRole, cooperative.address)).to.be.false;
    });
  });

  describe("Recording Batches", function () {
    beforeEach(async function () {
      await contract.addCooperative(cooperative.address);
    });

    it("records aggregate batch data and the off-chain lot commitment", async function () {
      await expect(
        contract
          .connect(cooperative)
          .recordBatch(
            "BAR-2026-001",
            "Kabarnet",
            "Baringo Highlands Honey Cooperative",
            185,
            120250,
            "2026-09-15",
            lotIdsHash
          )
      )
        .to.emit(contract, "BatchRecorded")
        .withArgs(
          "BAR-2026-001",
          "Kabarnet",
          "Baringo Highlands Honey Cooperative",
          185,
          120250,
          lotIdsHash,
          cooperative.address,
          anyValue
        );

      const batch = await contract.getBatch("BAR-2026-001");
      expect(batch.batchId).to.equal("BAR-2026-001");
      expect(batch.village).to.equal("Kabarnet");
      expect(batch.cooperativeName).to.equal(
        "Baringo Highlands Honey Cooperative"
      );
      expect(batch.moistureContent).to.equal(185);
      expect(batch.weightGrams).to.equal(120250);
      expect(batch.harvestDate).to.equal("2026-09-15");
      expect(batch.lotIdsHash).to.equal(lotIdsHash);
      expect(batch.verifiedBy).to.equal(cooperative.address);
    });

    it("keeps identities, offers, and payments out of calldata and events", async function () {
      const recordBatch = contract.interface.getFunction("recordBatch");
      const batchRecorded = contract.interface.getEvent("BatchRecorded");

      expect(recordBatch.inputs.map((input) => input.name)).to.deep.equal([
        "batchId",
        "village",
        "cooperativeName",
        "moistureContent",
        "weightGrams",
        "harvestDate",
        "lotIdsHash",
      ]);
      expect(batchRecorded.inputs.map((input) => input.name)).to.deep.equal([
        "batchId",
        "village",
        "cooperativeName",
        "moistureContent",
        "weightGrams",
        "lotIdsHash",
        "verifiedBy",
        "timestamp",
      ]);

      const forbidden = /farmer|user|phone|mpesa|payment|offer|mongo/i;
      expect(recordBatch.inputs.some((input) => forbidden.test(input.name))).to.be.false;
      expect(batchRecorded.inputs.some((input) => forbidden.test(input.name))).to.be.false;

      const tx = await contract.connect(cooperative).recordBatch(
        "BAR-2026-001",
        "Kabarnet",
        "Coop",
        185,
        120250,
        "2026-09-15",
        lotIdsHash
      );
      const decoded = contract.interface.parseTransaction({ data: tx.data });
      expect(decoded?.args.length).to.equal(7);
      expect(decoded?.args[6]).to.equal(lotIdsHash);
      expect(tx.data.toLowerCase()).not.to.contain(
        Buffer.from("64b64c2f3f3f3f3f3f3f3f3f").toString("hex")
      );
    });

    it("rejects a non-cooperative recording a batch", async function () {
      await expect(
        contract
          .connect(buyer)
          .recordBatch(
            "BAR-2026-001",
            "Kabarnet",
            "Fake Cooperative",
            185,
            120000,
            "2026-09-15",
            lotIdsHash
          )
      ).to.be.reverted;
    });

    it("rejects duplicate batch IDs", async function () {
      await contract
        .connect(cooperative)
        .recordBatch(
          "BAR-2026-001",
          "Kabarnet",
          "Coop",
          185,
          120000,
          "2026-09-15",
          lotIdsHash
        );

      await expect(
        contract
          .connect(cooperative)
          .recordBatch(
            "BAR-2026-001",
            "Kabarnet",
            "Coop",
            185,
            120000,
            "2026-09-15",
            secondLotIdsHash
          )
      ).to.be.revertedWith("Batch ID already exists");
    });

    it("rejects empty batch IDs", async function () {
      await expect(
        contract
          .connect(cooperative)
          .recordBatch("", "Kabarnet", "Coop", 185, 120000, "2026-09-15", lotIdsHash)
      ).to.be.revertedWith("Batch ID required");
    });

    it("rejects invalid moisture content", async function () {
      await expect(
        contract
          .connect(cooperative)
          .recordBatch(
            "BAR-2026-002",
            "Kabarnet",
            "Coop",
            1200,
            120000,
            "2026-09-15",
            lotIdsHash
          )
      ).to.be.revertedWith("Invalid moisture (0-100%)");
    });

    it("rejects zero weight", async function () {
      await expect(
        contract
          .connect(cooperative)
          .recordBatch(
            "BAR-2026-003",
            "Kabarnet",
            "Coop",
            185,
            0,
            "2026-09-15",
            lotIdsHash
          )
      ).to.be.revertedWith("Weight must be positive");
    });

    it("rejects the zero lot IDs hash", async function () {
      await expect(
        contract
          .connect(cooperative)
          .recordBatch(
            "BAR-2026-004",
            "Kabarnet",
            "Coop",
            185,
            120000,
            "2026-09-15",
            ethers.ZeroHash
          )
      ).to.be.revertedWith("Lot IDs hash required");
    });
  });

  describe("Reading Batches", function () {
    beforeEach(async function () {
      await contract.addCooperative(cooperative.address);
      await contract
        .connect(cooperative)
        .recordBatch(
          "BAR-2026-001",
          "Kabarnet",
          "Coop A",
          185,
          120500,
          "2026-09-15",
          lotIdsHash
        );
      await contract
        .connect(cooperative)
        .recordBatch(
          "BAR-2026-002",
          "Marigat",
          "Coop A",
          175,
          80000,
          "2026-09-16",
          secondLotIdsHash
        );
    });

    it("returns total batch count", async function () {
      expect(await contract.getTotalBatches()).to.equal(2);
    });

    it("returns a cooperative's batches", async function () {
      const batches = await contract.getCooperativeBatches(cooperative.address);
      expect(batches.length).to.equal(2);
      expect(batches[0]).to.equal("BAR-2026-001");
      expect(batches[1]).to.equal("BAR-2026-002");
    });

    it("returns a batch by index", async function () {
      expect(await contract.getBatchIdByIndex(0)).to.equal("BAR-2026-001");
      expect(await contract.getBatchIdByIndex(1)).to.equal("BAR-2026-002");
    });

    it("reverts for a non-existent batch", async function () {
      await expect(contract.getBatch("NON-EXISTENT")).to.be.revertedWith(
        "Batch not found"
      );
    });

    it("allows anyone to check batch existence", async function () {
      expect(await contract.batchIdExists("BAR-2026-001")).to.be.true;
      expect(await contract.batchIdExists("NON-EXISTENT")).to.be.false;
    });
  });
});
