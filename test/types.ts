import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import type { Fixture } from "ethereum-waffle";

import type { SpaceCoinToken } from "../typechain/SpaceCoinToken";
import type { SpaceCoinIco } from "../typechain/SpaceCoinIco";

declare module "mocha" {
  export interface Context {
    token: SpaceCoinToken;
    ico: SpaceCoinIco;
    loadFixture: <T>(fixture: Fixture<T>) => Promise<T>;
    signers: Signers;
  }
}

export interface Signers {
  admin: SignerWithAddress;
}
