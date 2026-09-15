import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    ganache: {
      url: "http://127.0.0.1:8545",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    amoy: {
      url:
        process.env.POLYGON_AMOY_RPC_URL ||
        "https://rpc-amoy.polygon.technology",
      accounts: process.env.POLYGON_AMOY_PRIVATE_KEY
        ? [process.env.POLYGON_AMOY_PRIVATE_KEY]
        : [],
      chainId: 80002,
    },
  },
  etherscan: {
    apiKey: process.env.POLYGONSCAN_API_KEY || "",
  },
};

export default config;