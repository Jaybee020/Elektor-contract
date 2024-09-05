import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";
const config: HardhatUserConfig = {
  solidity: "0.8.20",
  networks:
    process.env.ALCHEMY_API_KEY && process.env.PRIVATE_KEY
      ? {
          hardhat: {
            allowUnlimitedContractSize: true,
          },
          ethSepolia: {
            url: `https://eth-sepolia.g.alchemy.com/v2/${process.env
              .ALCHEMY_API_KEY!}`,
            chainId: 1,
            accounts: [process.env.PRIVATE_KEY!],
          },
          polygonAmoy: {
            url: `https://polygon-amoy.g.alchemy.com/v2/${process.env
              .ALCHEMY_API_KEY!}`,
            chainId: 80002,
            accounts: [process.env.PRIVATE_KEY!],
          },
        }
      : undefined,
};

export default config;
