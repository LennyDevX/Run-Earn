import { configVariable, defineConfig } from "hardhat/config";
import hardhatMocha from "@nomicfoundation/hardhat-mocha";
import hardhatViem from "@nomicfoundation/hardhat-viem";
import hardhatVerify from "@nomicfoundation/hardhat-verify";

export default defineConfig({
  plugins: [hardhatMocha, hardhatViem, hardhatVerify],
  networks: {
    polygon: {
      type: "http",
      chainType: "generic",
      url: configVariable("POLYGON_RPC_URL"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
    amoy: {
      type: "http",
      chainType: "generic",
      url: configVariable("POLYGON_AMOY_RPC_URL"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
  },
  verify: {
    etherscan: {
      apiKey: configVariable("POLYGONSCAN_API_KEY"),
    },
  },
  solidity: {
    profiles: {
      default: {
        compilers: [
          {
            version: "0.8.36",
            settings: {
              evmVersion: "cancun",
              optimizer: {
                enabled: true,
                runs: 200,
              },
            },
          },
        ],
      },
      production: {
        compilers: [
          {
            version: "0.8.36",
            settings: {
              evmVersion: "cancun",
              optimizer: {
                enabled: true,
                runs: 1000,
              },
            },
          },
        ],
      },
    },
  },
});
