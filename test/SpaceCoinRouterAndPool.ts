import { expect, assert } from "chai";
import { artifacts, ethers, waffle } from "hardhat";
import type { Artifact } from "hardhat/types";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import type { SpaceCoinToken, SpaceCoinIco, SpaceCoinRouter, SpaceCoinPool } from "../typechain";
import { Signers } from "./types";

import {deployMockContract} from '@ethereum-waffle/mock-contract';
import { BigNumber } from "ethers";

// Shared by Sunny
const ONE = ethers.BigNumber.from(1);
const TWO = ethers.BigNumber.from(2);
function sqrt(value: BigNumber): BigNumber {
  const x = value;
  let z = x.add(ONE).div(TWO);
  let y = x;
  while (z.sub(y).isNegative()) {
    y = z;
    z = x.div(z).add(z).div(TWO);
  }
  return y;
}

describe("SpaceCoinRouter & SpaceCoinPool", function () {

  enum Phase { SEED=0, GENERAL=1, OPEN=2 }

  const SPC_PER_ETH: number = 5;

  const parseEther = ethers.utils.parseEther
  const parseSPC = ethers.utils.parseEther
  const parseValue = ethers.utils.parseEther

  let ico: SpaceCoinIco;
  let token: SpaceCoinToken;
  let router: SpaceCoinRouter;
  let pool: SpaceCoinPool;

  let owner: SignerWithAddress;
  let treasury: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let addrs: SignerWithAddress[];

  beforeEach(async function () {
    [owner, treasury, alice, bob, carol, ...addrs] = await ethers.getSigners();

    let icoFactory = await ethers.getContractFactory("SpaceCoinIco");
    ico = <SpaceCoinIco>await icoFactory.deploy(treasury.address, []);
    await ico.deployed();

    let tokenArtifact = await artifacts.readArtifact("SpaceCoinToken");
    token = <SpaceCoinToken>new ethers.Contract(await ico.token(), tokenArtifact.abi, ethers.provider);

    let poolFactory = await ethers.getContractFactory("SpaceCoinPool");
    pool = <SpaceCoinPool>await poolFactory.deploy(token.address);
    await pool.deployed();

    let routerFactory = await ethers.getContractFactory("SpaceCoinRouter");
    router = <SpaceCoinRouter>await routerFactory.deploy(token.address, pool.address);
    await router.deployed();
  });

  describe("::ROUTER::", async function () {
    describe("liquidity", async function() {
      beforeEach(async function() {
        // Move to OPEN with 30K ETH contributed
        ico.connect(owner).advancePhase(Phase.OPEN);
        ico.connect(alice).buySPC({value: parseEther("30000")});
      });

      it("can withdraw ICO contributions", async function() {
        await expect(await ico.connect(treasury).withdrawToTreasury(parseEther("30000"))).to.
          changeEtherBalance(treasury, parseEther("30000"));
      });

      it("can add liquidity to pool", async function() {
        let ethAmount = parseEther("30000");
        let spcAmount = parseSPC("150000");
        let spcInitialBalance = await token.balanceOf(treasury.address);

        // withdraw funds
        await ico.connect(treasury).withdrawToTreasury(ethAmount);

        // Expect 0 liquidity tokens initially
        expect(await pool.balanceOf(treasury.address)).to.equal(0);

        // Add liquidity
        await token.connect(treasury).increaseAllowance(router.address, spcAmount);
        await expect(
          await router.connect(treasury).addLiquidity(spcAmount, treasury.address, {value: ethAmount})
        ).to.
          changeEtherBalances([treasury, pool], [ethAmount.mul(-1), ethAmount]).
          emit(pool, 'LiquidityAdded').withArgs(treasury.address, spcAmount, ethAmount).
          emit(pool, 'Reserves').withArgs(spcAmount, ethAmount);

        // Confirm SPC transferred out of Treasury
        let spcFinalBalance = await token.balanceOf(treasury.address);
        expect(spcInitialBalance.sub(spcAmount)).to.equal(spcFinalBalance);

        // Confirm SPC transferred to Pool
        expect(await token.balanceOf(pool.address)).to.equal(spcAmount);
        expect(await pool.spcReserve()).to.equal(spcAmount);
        // Confirm ETH transferred to Pool
        expect(await pool.ethReserve()).to.equal(ethAmount);

        // Confirm liqidity tokens
        let expectedLiquidity = sqrt(spcAmount.mul(ethAmount)).sub(1000);
        expect(await pool.balanceOf(treasury.address)).to.equal(expectedLiquidity);
      });

      it("can remove pool liquidity", async function() {
        let ethAmount = parseEther("30000");
        let spcAmount = parseSPC("150000");

        // Add liquidity - in twp batches to test both mint() codepaths
        await ico.connect(treasury).withdrawToTreasury(ethAmount);
        await token.connect(treasury).increaseAllowance(router.address, spcAmount);
        await router.connect(treasury).
          addLiquidity(spcAmount.div(2), treasury.address, {value: ethAmount.div(2)})
        await router.connect(treasury).
          addLiquidity(spcAmount.div(2), treasury.address, {value: ethAmount.div(2)})

        let liquidityToBurn = await pool.balanceOf(treasury.address);
        let liquiditySupply = await pool.totalSupply();
        let ethPreBalance: BigNumber = await ethers.provider.getBalance(pool.address);
        let spcPreBalance: BigNumber = await token.balanceOf(pool.address);
        let spcReturnAmount = liquidityToBurn.mul(spcPreBalance).div(liquiditySupply);
        let ethReturnAmount = liquidityToBurn.mul(ethPreBalance).div(liquiditySupply);
        let spcPostBalance = spcPreBalance.sub(spcReturnAmount);
        let ethPostBalance = ethPreBalance.sub(ethReturnAmount);

        let spcInitialBalance = await token.balanceOf(treasury.address);

        // Remove liquidity
        await pool.connect(treasury).increaseAllowance(router.address, liquidityToBurn);
        await expect(
          await router.connect(treasury).
            removeLiquidity(liquidityToBurn, spcReturnAmount, ethReturnAmount, treasury.address)
        ).to.
          changeEtherBalances([treasury, pool], [ethReturnAmount, ethReturnAmount.mul(-1)]).
          emit(pool, 'LiquidityRemoved').withArgs(treasury.address, spcReturnAmount, ethReturnAmount).
          emit(pool, 'Reserves').withArgs(spcPostBalance, ethPostBalance);

        // Confirm SPC transferred out of Pool
        expect(await token.balanceOf(pool.address)).to.equal(spcPostBalance);

        // Confirm SPC transferred to Treasury
        let spcFinalBalance = await token.balanceOf(treasury.address);
        expect(spcInitialBalance.add(spcReturnAmount)).to.equal(spcFinalBalance);
        expect(await pool.spcReserve()).to.equal(spcPostBalance);
        // Confirm ETH transferred to Treasury
        expect(await pool.ethReserve()).to.equal(ethPostBalance);

        // Confirm liqidity tokens
        expect(await pool.balanceOf(treasury.address)).to.equal(0);
        expect(await pool.totalSupply()).to.equal(1000);
      });
    });

    describe("swapping", async function() {
      beforeEach(async function() {
        let ethAmount = parseEther("10000");
        let spcAmount = parseSPC("50000");

        // Move to OPEN with 30K ETH contributed
        await ico.connect(owner).advancePhase(Phase.OPEN);
        await ico.connect(alice).buySPC({value: ethAmount});
        await ico.connect(bob).buySPC({value: ethAmount});

        // Alice adds liquidity
        await token.connect(alice).increaseAllowance(router.address, spcAmount);
        await router.connect(alice).addLiquidity(spcAmount, alice.address, {value: ethAmount});
        // Bob adds liquidity
        await token.connect(bob).increaseAllowance(router.address, spcAmount);
        await router.connect(bob).addLiquidity(spcAmount, bob.address, {value: ethAmount});
      });

      describe("with SPC tax disabled", async function() {
        beforeEach(async function() {
          await token.connect(treasury).enableTax(false);
        });

        it("can swap SPC for ETH", async function() {
          let trader = addrs[0];
          let spcIn = parseSPC("100");

          // Buy SPC and grant sufficient token allowance to router
          await ico.connect(trader).buySPC({value: parseSPC("100")});
          await token.connect(trader).increaseAllowance(router.address, spcIn);

          let ethBalanceBefore = await ethers.provider.getBalance(trader.address);

          // Swap with unmet ETH min (should fail)
          await expect(
            router.connect(trader).swapSPCforETH(spcIn, parseEther("20"), trader.address)
          ).to.be.revertedWith("UNMET_MIN_RETURN");

          // Swap
          await expect(
            () => router.connect(trader).swapSPCforETH(spcIn, parseEther("19"), trader.address)
          ).to.changeTokenBalance(token, trader, spcIn.mul(-1));

          let ethBalanceAfter = await ethers.provider.getBalance(trader.address);

          expect(ethBalanceAfter.sub(ethBalanceBefore)).to.be.
            lt(parseEther("19.8")).and.
            gt(parseEther("19.7"));
        });

        it("can swap ETH for SPC", async function() {
          let trader = addrs[0];
          let ethIn = parseEther("100");
          let spcOut = parseSPC("492");

          let ethBalanceBefore = await ethers.provider.getBalance(trader.address);
          let spcBalanceBefore = await token.balanceOf(trader.address);

          // Swap with unmet SPC MIN (should fail)
          await expect(
            router.connect(trader).swapETHforSPC(parseSPC("500"), trader.address, {value: ethIn})
          ).to.be.revertedWith("UNMET_MIN_RETURN");

          // Swap
          await expect(
            router.connect(trader).swapETHforSPC(spcOut, trader.address, {value: ethIn})
          ).to.not.be.reverted;

          let ethBalanceAfter = await ethers.provider.getBalance(trader.address);
          let spcBalanceAfter = await token.balanceOf(trader.address);

          expect(ethBalanceBefore.sub(ethBalanceAfter)).to.be.
            lt(parseEther("100.1")).and.
            gt(parseEther("100"));

          expect(spcBalanceAfter.sub(spcBalanceBefore)).to.be.
            lt(parseEther("493")).and.
            gt(parseEther("492"));
        });
      });

      describe("with SPC tax enabled", async function() {
        beforeEach(async function() {
          await token.connect(treasury).enableTax(true);
        });

        it("can swap SPC for ETH", async function() {
          let trader = addrs[0];
          let spcIn = parseSPC("100");

          // Buy SPC and grant sufficient token allowance to router
          await ico.connect(trader).buySPC({value: parseSPC("100")});
          await token.connect(trader).increaseAllowance(router.address, spcIn);

          let ethBalanceBefore = await ethers.provider.getBalance(trader.address);

          // Swap with unmet ETH min (should fail)
          await expect(
            router.connect(trader).swapSPCforETH(spcIn, parseEther("20"), trader.address)
          ).to.be.revertedWith("UNMET_MIN_RETURN");

          // Swap
          await expect(
            () => router.connect(trader).swapSPCforETH(spcIn, parseEther("19"), trader.address)
          ).to.changeTokenBalance(token, trader, spcIn.mul(-1));

          let ethBalanceAfter = await ethers.provider.getBalance(trader.address);

          expect(ethBalanceAfter.sub(ethBalanceBefore)).to.be.
            lt(parseEther("19.4")).and.
            gt(parseEther("19.3"));
        });

        it("can swap ETH for SPC", async function() {
          let trader = addrs[0];
          let ethIn = parseEther("100");
          let spcOut = parseSPC("482");

          let ethBalanceBefore = await ethers.provider.getBalance(trader.address);
          let spcBalanceBefore = await token.balanceOf(trader.address);

          // Swap with unmet SPC MIN (should fail)
          await expect(
            router.connect(trader).swapETHforSPC(parseSPC("500"), trader.address, {value: ethIn})
          ).to.be.revertedWith("UNMET_MIN_RETURN");

          // Swap
          await expect(
            router.connect(trader).swapETHforSPC(spcOut, trader.address, {value: ethIn})
          ).to.not.be.reverted;

          let ethBalanceAfter = await ethers.provider.getBalance(trader.address);
          let spcBalanceAfter = await token.balanceOf(trader.address);

          expect(ethBalanceBefore.sub(ethBalanceAfter)).to.be.
            lt(parseEther("101")).and.
            gt(parseEther("100"));

          expect(spcBalanceAfter.sub(spcBalanceBefore)).to.be.
            lt(parseEther("483")).and.
            gt(parseEther("482"));
        });
      });
    });
  });

  describe("::POOL::", async function() {
    describe("sync", async function() {
      beforeEach(async function() {
        await ico.connect(owner).advancePhase(Phase.OPEN);
      });

      it("updates reserves with direct transfers", async function() {
        let spcAmount = parseSPC("50");

        // Alice accidentally sends 50 SPC directly to the Pool
        await ico.connect(alice).buySPC({value: spcAmount});
        await token.connect(alice).increaseAllowance(alice.address, spcAmount);
        await token.connect(alice).transferFrom(alice.address, pool.address, spcAmount);

        // Expect the reserves to still show 0 SPC
        let spcReserve, ethReserve;
        [spcReserve, ethReserve] = await pool.getReserves();
        expect(spcReserve).to.equal(0);

        // Sync
        await pool.sync();

        // Expect the reserves to still show 50 SPC
        [spcReserve, ethReserve] = await pool.getReserves();
        expect(spcReserve).to.equal(parseSPC("50"));
      });
    });
  });
});
