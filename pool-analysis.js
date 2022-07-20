import Web3 from 'web3';
import { readFile } from 'fs/promises';
import BigNumber from 'bignumber.js';

const TRANSFER_FROM_HASH = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const NEW_SPOT_PRICE_HASH = '';
const NEW_DELTA_HASH = '';
const LINEAR_CURVE = '0x5B6aC51d9B1CeDE0068a1B26533CAce807f883Ee';
const EXPONENTIAL_CURVE = '0x432f962D8209781da23fB37b6B59ee15dE7d9841';

const web3 = new Web3("https://eth-mainnet.g.alchemy.com/v2/dLIsdPg9_vU17J1b7XmTHIZ20Q2T4eRq");

const poolAddress = '0xD2a6D0280ff48CcBCD654d5D0Ecc45eF1e1cDBc3';
const abi = JSON.parse(await readFile("pool.json", "utf8"));

let contract = new web3.eth.Contract(abi, poolAddress);
let curve = await contract.methods.bondingCurve().call();
let curveType = undefined;
if (curve.toLowerCase() === LINEAR_CURVE.toLowerCase()) {
  curveType = 'LINEAR';
}
else if (curve.toLowerCase() === EXPONENTIAL_CURVE.toLowerCase()) {
  curveType = 'EXPONENTIAL';
}
else {
  throw console.error('Unknown curve');
}

// Get all swaps in/out of the pair
let swapIn = await contract.getPastEvents('SwapNFTInPair', {
  fromBlock: 14718842 
});
let swapOut = await contract.getPastEvents('SwapNFTOutPair', {
  fromBlock: 14718842 
});
let swaps = [];
for (let t of swapIn) {
  let tx = {
    hash: t.transactionHash,
    block: t.blockNumber
  }
  swaps.push(tx);
}
for (let t of swapOut) {
  let tx = {
    hash: t.transactionHash,
    block: t.blockNumber
  }
  swaps.push(tx);
}

// Get all fee updates
let feeChanges = await contract.getPastEvents('FeeUpdate', {
  fromBlock: 14718842 
});
// If no updates ever, then get current value
let fee;
if (feeChanges.length === 0) {
  fee = new BigNumber(await contract.methods.fee().call()).div(new BigNumber(10**18));
}
else {
  // idk we handle this later
  throw console.error("Handle this later");
}

let buyCount = 0;
let buyAmount = 0;
let sellCount = 0;
let sellAmount = 0;
for (let s of swaps) {
  let tx = await web3.eth.getTransactionReceipt(s.hash);
  let events = tx.logs;
  let numBuys = 0;
  let numSells = 0;
  for (let e of events) {

    if (e.topics[0] === TRANSFER_FROM_HASH) {
      let toAddress = e.topics[2].slice(e.topics[2].length + 2 - poolAddress.length);
      if (toAddress.toLowerCase() === poolAddress.slice(2).toLowerCase()) {
        numBuys += 1;
      }
      else {
        numSells += 1;
      }
    }

    let spotPrice;
    let delta;


    // Do the pricing calculation here
    if (numBuys > 0) {

    }
    else if (numSells > 0) {

    }

    buyAmount += numBuys;
    sellAmount += numSells;
  }
}
console.log(buyAmount, sellAmount);
