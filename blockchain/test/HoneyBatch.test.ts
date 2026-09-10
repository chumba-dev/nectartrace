import { expect } from "chai";
import { ethers } from "hardhat";

describe("HoneyBatch", function () {
  it("Should return the initial greeting", async function () {
    const HoneyBatch = await ethers.getContractFactory("HoneyBatch");
    const contract = await HoneyBatch.deploy();
    await contract.waitForDeployment();

    expect(await contract.getGreeting()).to.equal("NectarTrace is alive");
  });

  it("Should update the greeting", async function () {
    const HoneyBatch = await ethers.getContractFactory("HoneyBatch");
    const contract = await HoneyBatch.deploy();
    await contract.waitForDeployment();

    await contract.setGreeting("Baringo honey is pure");
    expect(await contract.getGreeting()).to.equal("Baringo honey is pure");
  });
});