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

## Deployments

### Rinkeby

Deployment command and output:

```bash
npx hardhat run --network rinkeby scripts/deploy.js

> Deploying contracts with the account: 0xd67314eCc432c3886c85d3BD0eE4DfC68463E697
> Deployer address (whitelisted): 0xd67314eCc432c3886c85d3BD0eE4DfC68463E697
> Treasury address (whitelisted): 0x89661045a8E28dc9900138843Fd8e0Ed031c1D18
> Seed Investor address: 0x2565D8784b9F5d594C95394A1112ee039C97e3c4
> Seed Investor address: 0x5f82348C805B0e11f7BfB57f4505C7F7ebFC4626
> Ico address: 0x650d8d6d7a60eBd821C749C912d3dEFF195238f0
> Token address: 0xc3C02fc096B701F6a5b03DE1583834D9D49F2B28
> Pool address: 0xa4bab3c7182F8fe8DA6d9362891679dC75646a99
> Router address: 0x2C2775990C611F8C8e756D13Daed1836A088Ee9c
```

