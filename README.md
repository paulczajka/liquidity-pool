# SpaceCoinToken, ICO, Liquidity Pool

An implementation of an ERC20 token with an ICO-controlling contract, and liquidity pool.

## Contracts

### SpaceCoinToken.sol

SpaceCoin (SPC) is an ERC20 token with a total supply of 500,000.  150,000 is allocated to ICO, and the remainder to a treasury address for liquidity and/or other fundings. A 2% transfer tax can be toggled for additional fundraising.

### SpaceCoinIco.sol

SPC initial coin offering, through three phases:

SEED
 - Open to whitelisted investors only.
 - Total contribution limit of 15,000 ETH
 - Individual contribution limit of 1,500 ETH

GENERAL
 - Open to everyone
 - Total contribution limit of 30,000 ETH
 - Individual contribution limit of 1,000 ETH

OPEN
 - Open to everyone
 - Total contribution limit of 100,000 ETH
 - No individual contribution limit


### SpaceCoinRouter.sol & SpaceCoinPool.sol

Liquidity pool for ETH-SPC and router.  Similar to Uniswap V2, but tailored for ETH (rather than WETH), with accounting of SPC transfer tax.


## Getting Started

To setup the local environment:

```bash
npm install
```

To run tests:

```bash
npx hardhat typechain
npx hardhat test
```

To deploy to the local hardhat node:

```bash
npx hardhat node

# In separate terminal
npx hardhat run --network localhost scripts/deploy.js
```

Note the addresses displayed to the console.

### Frontend:

The front-end is a local test harness to validate ICO / liquidity pool operations.

Update `frontend/src/index.js` with the contract addresses displayed from the deploy.js script. Then:

```bash
cd frontend
npm install
npm start --no-cache
```

Navigate to http://localhost:1234/

Accounts used for local testing:
- Hardhat Account #0: Deployer
- Hardhat Account #1: Treasury
- Hardhat Account #2: Whitelisted Seed Investor
- Hardhat Account #3: Whitelisted Seed Investor

