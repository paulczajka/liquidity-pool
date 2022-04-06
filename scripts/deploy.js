// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");

async function main() {
  const [deployer, treasury, seed1, seed2] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  /*
   * Ico and Token
   */
  const whitelist = [
    deployer.address,
    treasury.address,
    seed1.address,
    seed2.address,
  ];

  const Ico = await hre.ethers.getContractFactory("SpaceCoinIco");
  const ico = await Ico.deploy(treasury.address, whitelist);
  await ico.deployed();

  console.log("Deployer address (whitelisted):", deployer.address);
  console.log("Treasury address (whitelisted):", treasury.address);
  console.log("Seed Investor address:", seed1.address);
  console.log("Seed Investor address:", seed2.address);
  console.log("Ico address:", ico.address);
  let tokenAddress = await ico.token();
  console.log("Token address:", tokenAddress);

  /*
   * Pool
   */
  const Pool = await hre.ethers.getContractFactory("SpaceCoinPool");
  const pool = await Pool.deploy(tokenAddress);
  await pool.deployed();

  console.log("Pool address:", pool.address);

  /*
   * Router
   */
  const Router = await hre.ethers.getContractFactory("SpaceCoinRouter");
  const router = await Router.deploy(tokenAddress, pool.address);
  await router.deployed();

  console.log("Router address:", router.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
