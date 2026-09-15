import { ethers } from "hardhat";

async function main() {
  console.log("🚀 Deploying HoneyBatch contract...\n");

  const [deployer] = await ethers.getSigners();
  console.log("📍 Deploying with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("💰 Account balance:", ethers.formatEther(balance), "ETH\n");

  const HoneyBatch = await ethers.getContractFactory("HoneyBatch");
  const contract = await HoneyBatch.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("✅ HoneyBatch deployed to:", address);
  console.log("👑 Admin (deployer):", deployer.address);
  console.log("\n📝 Save this address to your .env files:");
  console.log(`CONTRACT_ADDRESS=${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });