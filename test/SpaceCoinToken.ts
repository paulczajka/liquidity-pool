import { expect, assert } from "chai";
import { artifacts, ethers, waffle } from "hardhat";
import type { Artifact } from "hardhat/types";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import type { SpaceCoinToken } from "../typechain/SpaceCoinToken";
import { Signers } from "./types";


describe("SpaceCoinToken", function () {

  const parseEther = ethers.utils.parseEther;
  const parseSPC = ethers.utils.parseEther;

  let tokenFactory;
  let token: SpaceCoinToken;
  let owner: SignerWithAddress;
  let treasury: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let addrs: SignerWithAddress[];

  describe("::UNIT::", async function () {
    beforeEach(async function () {
      [owner, treasury, alice, bob, ...addrs] = await ethers.getSigners();

      let factory = await ethers.getContractFactory("SpaceCoinToken");
      token = <SpaceCoinToken>await factory.deploy(treasury.address);
      await token.deployed()
    });

    describe("Initial state", function () {
      it("has total supply of 500,000", async function () {
        expect(await token.totalSupply()).to.equal(parseSPC("500000"));
      });

      it("owner owns 150,000 tokens", async function () {
        expect(await token.balanceOf(owner.address)).to.equal(parseSPC("150000"));
      });

      it("treasury  owns 350,000 tokens", async function () {
        expect(await token.balanceOf(treasury.address)).to.equal(parseSPC("350000"));
      });


      it("has tax disabled", async function () {
        expect(await token.currentTaxPercent()).to.equal(0);
      });
    });

    describe("ERC20", async function () {
      it("has expected name and symbol", async function () {
        expect(await token.name()).to.equal("Space Coin");
        expect(await token.symbol()).to.equal("SPC");
      });
    });

    describe("enableTax()", async function () {
      it("reverts if not treasury", async function () {
        await expect(token.connect(alice).enableTax(true)).to.be.revertedWith("ONLY_TREASURY");
      });

      it("enables and disables the tax flag", async function () {
        // enable taxing
        await token.connect(treasury).enableTax(true);
        expect(await token.currentTaxPercent()).to.equal(2);

        // disable taxing
        await token.connect(treasury).enableTax(false);
        expect(await token.currentTaxPercent()).to.equal(0);
      });

      // NOTE: See the SpaceCoinIco tests for additional tax tests:
      // Search the file for "ADDITIONAL TAX TESTS"
    });
  });
});
