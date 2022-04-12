import { ethers } from "ethers"
import { BigNumber } from "bignumber.js"
import IcoJSON from '../../artifacts/contracts/SpaceCoinIco.sol/SpaceCoinIco.json'
import TokenJSON from '../../artifacts/contracts/SpaceCoinToken.sol/SpaceCoinToken.json'
import RouterJSON from '../../artifacts/contracts/SpaceCoinRouter.sol/SpaceCoinRouter.json'
import PoolJSON from '../../artifacts/contracts/SpaceCoinPool.sol/SpaceCoinPool.json'

const provider = new ethers.providers.Web3Provider(window.ethereum)
const signer = provider.getSigner()

const icoAddr = '0x650d8d6d7a60eBd821C749C912d3dEFF195238f0'
const ico = new ethers.Contract(icoAddr, IcoJSON.abi, provider);

const routerAddr = '0x2C2775990C611F8C8e756D13Daed1836A088Ee9c'
const router = new ethers.Contract(routerAddr, RouterJSON.abi, provider);

const poolAddr = '0xa4bab3c7182F8fe8DA6d9362891679dC75646a99';
const pool = new ethers.Contract(poolAddr, PoolJSON.abi, provider);

const treasury = '0x89661045a8E28dc9900138843Fd8e0Ed031c1D18';

let token;
let icoPhase;
let icoSpcAvailable;
let spcPoolReserve = 0;
let ethPoolReserve = 0;
let currentSpcToEthPrice = 0.2;
let currentEthToSpcPrice = 5;

const Phase_SEED = 0;
const Phase_GENERAL = 1;
const Phase_OPEN = 2;

async function connectToMetamask() {
  try {
    console.log("Signed in as", await signer.getAddress())
  }
  catch(err) {
    console.log("Not signed in")
    await provider.send("eth_requestAccounts", [])
  }
}

window.onload = async () => {
  connectToMetamask();
  const tokenAddr = await ico.connect(signer).token();
  token = new ethers.Contract(tokenAddr, TokenJSON.abi, provider);
  await updateIcoPhase();
  await updateSpcAvailable();
  await updateEthFunds();
};

function clearError() {
  document.getElementById("error").innerText = '';
}

function displayError(err) {
  if (err.data && err.data.message) {
    document.getElementById("error").innerText = err.data.message;
  } else if (err.message) {
    document.getElementById("error").innerText = err.message;
  }
}

async function updateIcoPhase() {
  icoPhase = await ico.connect(signer).phase();
  console.log("Phase: ", icoPhase);
  const elem = document.getElementById('icoPhase');
  switch(icoPhase) {
    case Phase_SEED:
      elem.innerText = 'SEED';
      break;
    case Phase_GENERAL:
      elem.innerText = 'GENERAL';
      break;
    case Phase_OPEN:
      elem.innerText = 'OPEN';
      break;
  }
}

async function updateSpcAvailable() {
  let icoBalance = await token.connect(signer).balanceOf(icoAddr);
  document.getElementById('icoSpcAvailable').innerText = icoBalance / 1e18;
  let treasurySPC = await token.connect(signer).balanceOf(treasury);
  document.getElementById('icoTreasurySPC').innerText = treasurySPC / 1e18;
}

async function updateEthFunds() {
  const icoETH = await ico.connect(signer).availableFunds();
  document.getElementById('icoETH').innerText = icoETH / 1e18;
  const treasuryETH = await provider.getBalance(treasury);
  document.getElementById('icoTreasuryETH').innerText = treasuryETH / 1e18;
}

async function updatePoolReserves() {
  [spcPoolReserve, ethPoolReserve] = await pool.connect(signer).getReserves();
  document.getElementById('lpSpcReserve').innerText = spcPoolReserve / 1e18;
  document.getElementById('lpEthReserve').innerText = ethPoolReserve / 1e18;
}

async function updateYourHoldings() {
  let yourAddr = await signer.getAddress();
  let yourEth = await signer.getBalance();
  document.getElementById('lpYourEth').innerText = yourEth / 1e18;
  let yourSpc = await token.connect(signer).balanceOf(yourAddr);
  document.getElementById('lpYourSpc').innerText = yourSpc / 1e18;
  let yourLP = await pool.connect(signer).balanceOf(yourAddr);
  document.getElementById('lpYourLP').innerText = yourLP / 1e18;
}

provider.on("block", async n => {
  console.log("New block", n)
  await updateIcoPhase();
  await updateSpcAvailable();
  await updateEthFunds();
  await updatePoolReserves();
  await updateYourHoldings();

  if (icoPhase == Phase_OPEN && spcPoolReserve > 0 && ethPoolReserve > 0) {
    currentSpcToEthPrice = await router.connect(signer).quoteSwapSPCforETH(1000) / 1000.0;
    currentEthToSpcPrice = await router.connect(signer).quoteSwapETHforSPC(1000) / 1000.0;
    console.log("1 SPC => ", currentSpcToEthPrice, " ETH");
    console.log("1 ETH => ", currentEthToSpcPrice, " SPC");
  }
})

//
// ICO
//
ico_set_general.addEventListener('submit', async e => {
  e.preventDefault();
  await connectToMetamask()
  clearError();
  try {
    (await ico.connect(signer).advancePhase(Phase_GENERAL)).wait();
  } catch (err) {
    displayError(err);
  }
})

ico_set_open.addEventListener('submit', async e => {
  e.preventDefault();
  await connectToMetamask()
  clearError();
  try {
    (await ico.connect(signer).advancePhase(Phase_OPEN)).wait();
  } catch (err) {
    displayError(err);
  }
})

ico_spc_buy.addEventListener('submit', async e => {
  e.preventDefault()
  const form = e.target
  const eth = ethers.utils.parseEther(form.eth.value)
  console.log("Buying", eth, "eth")

  await connectToMetamask()
  clearError();
  try {
    (await ico.connect(signer).buySPC({value: eth})).wait();
  } catch (err) {
    displayError(err);
  }
})

ico_withdraw_to_treasury.addEventListener('submit', async e => {
  e.preventDefault()

  await connectToMetamask()
  clearError();
  try {
    const availableFunds = await ico.connect(signer).availableFunds();
    (await ico.connect(signer).withdrawToTreasury(availableFunds)).wait();
  } catch (err) {
    displayError(err);
  }
})


//
// LP
//

lp_deposit.eth.addEventListener('input', e => {
  lp_deposit.spc.value = +e.target.value * currentEthToSpcPrice;
})

lp_deposit.spc.addEventListener('input', e => {
  lp_deposit.eth.value = +e.target.value * currentSpcToEthPrice;
})

lp_deposit.addEventListener('submit', async e => {
  e.preventDefault()
  const form = e.target
  const eth = ethers.utils.parseEther(form.eth.value)
  const spc = ethers.utils.parseEther(form.spc.value)
  console.log("Depositing", eth, "eth and", spc, "spc")

  await connectToMetamask()
  clearError();
  try {
    await token.connect(signer).increaseAllowance(routerAddr, spc);
    await router.connect(signer).addLiquidity(spc, await signer.getAddress(), {value: eth});
  } catch (err) {
    displayError(err);
  }
})

lp_withdraw.addEventListener('submit', async e => {
  e.preventDefault()
  console.log("Withdrawing 100% of LP")

  await connectToMetamask()
  clearError();
  try {
    let signerAddr = await signer.getAddress();
    let lpTokenBalance = await pool.connect(signer).balanceOf(signerAddr);
    await pool.connect(signer).increaseAllowance(routerAddr, lpTokenBalance);
    await router.connect(signer).removeLiquidity(lpTokenBalance, 0, 0, signerAddr);
  } catch (err) {
    displayError(err);
  }
})

//
// Swap
//
let swapIn = { type: 'eth', value: 0 }
let swapOut = { type: 'spc', value: 0 }
switcher.addEventListener('click', () => {
  [swapIn, swapOut] = [swapOut, swapIn]
  swap_in_label.innerText = swapIn.type.toUpperCase()
  swap.amount_in.value = swapIn.value
  updateSwapOutLabel()
})

swap.amount_in.addEventListener('input', updateSwapOutLabel)

function updateSwapOutLabel() {
  swapOut.value = swapIn.type === 'eth'
    ? +swap.amount_in.value * currentEthToSpcPrice
    : +swap.amount_in.value * currentSpcToEthPrice

  swap_out_label.innerText = `${swapOut.value} ${swapOut.type.toUpperCase()}`
}

swap.addEventListener('submit', async e => {
  e.preventDefault()
  const form = e.target
  const amountIn = ethers.utils.parseEther(form.amount_in.value)

  console.log("Swapping", amountIn, swapIn.type, "for", swapOut.type)

  await connectToMetamask()
  clearError();
  try {
    let signerAddr = await signer.getAddress();
    if (swapIn.type === 'eth') {
      await router.connect(signer).swapETHforSPC(ethers.utils.parseEther("0"), signerAddr, {value: amountIn});
    } else {
      await token.connect(signer).increaseAllowance(routerAddr, amountIn);
      await router.connect(signer).swapSPCforETH(amountIn, ethers.utils.parseEther("0"), signerAddr);
    }
  } catch (err) {
    displayError(err);
  }
})
