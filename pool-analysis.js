import Web3 from 'web3';
import { readFile } from 'fs/promises';
import BigNumber from 'bignumber.js';
import * as fs from 'fs';

const TRANSFER_FROM_HASH = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const NEW_SPOT_PRICE_HASH = '0xf06180fdbe95e5193df4dcd1352726b1f04cb58599ce58552cc952447af2ffbb';
const NEW_DELTA_HASH = '0x66c55c30868c51e7ad52e3d85d1403576a9967614e67c48e25b55a10baa650c0';
const LINEAR_CURVE = '0x5B6aC51d9B1CeDE0068a1B26533CAce807f883Ee';
const EXPONENTIAL_CURVE = '0x432f962D8209781da23fB37b6B59ee15dE7d9841';
const abi = JSON.parse(await readFile("pool.json", "utf8"));

// Bls don't overload my node, just fill w/ diff alchemy node
const web3 = new Web3("");

// Pool values (fill these in with your own values)
// This is the trade pool address you want to investigate
const poolAddress = '0x8231FCe520B0b140F3f8d330619dCe36658417E6';
// This are the values set during pool creation
let initialDelta = new BigNumber('');
const initialFee = (new BigNumber('')).div(new BigNumber(10**18));


let contract = new web3.eth.Contract(abi, poolAddress);
let curve = await contract.methods.bondingCurve().call();
let curveType = undefined;
if (curve.toLowerCase() === LINEAR_CURVE.toLowerCase()) {
  curveType = 'LINEAR';
}
else if (curve.toLowerCase() === EXPONENTIAL_CURVE.toLowerCase()) {
  curveType = 'EXPONENTIAL';
  initialDelta = initialDelta.div(new BigNumber(10 ** 18));
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
let fees = [];
if (feeChanges.length === 0) {
  let fee = new BigNumber(await contract.methods.fee().call()).div(new BigNumber(10**18));
  fees.push({
    value: fee,
    block: 0
  });
}
else {
  fees.push({
    value: initialFee,
    block: 0
  })
  for (let change of feeChanges) {
    fees.push({
      value: new BigNumber(change.returnValues['newFee']).div(new BigNumber(10**18)),
      block: change.blockNumber
    });
  }
}

// Get all delta updates
let deltaChanges = await contract.getPastEvents('DeltaUpdate', {
  fromBlock: 14718842 
});
// If no updates ever, then get current value
let deltas = []; 
if (deltaChanges.length === 0) {
  let delta = new BigNumber(await contract.methods.delta().call());
  if (curveType === 'EXPONENTIAL') {
    delta = delta.div(new BigNumber(10**18));
  }
  deltas.push({
    value: delta,
    block: 0
  });
}
else {
  deltas.push({
    value: initialDelta,
    block: 0
  });
  for (let change of deltaChanges) {
    let delta = new BigNumber(change.returnValues['newDelta']);
    if (curveType === 'EXPONENTIAL') {
      delta = delta.div(new BigNumber(10**18));
    }
    deltas.push({
      value: delta,
      block: change.blockNumber
    })
  }
}

let getLatestValue = ((values, block) => {
  for (let i = 0; i < values.length -1; i++) {
    if (block >= values[i].block && block <= values[i+1].block) {
      return values[i].value
    }
  }
  return values[values.length-1].value;
});

let buyCount = 0;
let buyPrices = []
let sellCount = 0;
let sellPrices = [];
for (let s of swaps) {
  let tx = await web3.eth.getTransactionReceipt(s.hash);
  let events = tx.logs;
  let numBuys = 0;
  let numSells = 0;
  let delta = getLatestValue(deltas, s.block);
  let fee = getLatestValue(fees, s.block);
  let spotPrice;
  for (let e of events) {
    if (e.topics[0] === TRANSFER_FROM_HASH) {
      let toAddress = e.topics[2].slice(e.topics[2].length + 2 - poolAddress.length);
      let fromAddress = e.topics[1].slice(e.topics[1].length + 2 - poolAddress.length);

      // If the item is going *to* the pool, it is the pool buying 1
      if (toAddress.toLowerCase() === poolAddress.slice(2).toLowerCase()) {
        numBuys += 1;
      }

      // Else, if the item is going *from* the pool, it is the pool selling 1
      else if (fromAddress.toLowerCase() === poolAddress.slice(2).toLowerCase()) {
        numSells += 1;
      }
    }
    if (e.topics[0] === NEW_SPOT_PRICE_HASH) {
      spotPrice = new BigNumber(web3.eth.abi.decodeParameter('uint128', e.data));
    }
  }
  buyCount += numBuys;
  sellCount += numSells;

  // Do the pricing calculation here
  if (numBuys > 0) {
    for (let i = 0; i < numBuys; i++) {
      if (curveType === 'EXPONENTIAL') {
        spotPrice = spotPrice.times(delta);
      }
      else if (curveType === 'LINEAR') {
        spotPrice = spotPrice.plus(delta);
      }
      let buyPrice = spotPrice.div(new BigNumber(new BigNumber(1).plus(fee)));
      buyPrices.push(buyPrice);
    }
  }
  else if (numSells > 0) {
    for (let i = 0; i < numSells; i++) {
      let sellPrice = spotPrice.times(new BigNumber(new BigNumber(1).plus(fee)));
      sellPrices.push(sellPrice);
      if (curveType === 'EXPONENTIAL') {
        spotPrice = spotPrice.div(delta);
      }
      else if (curveType === 'LINEAR') {
        spotPrice = spotPrice.minus(delta);
      }
    }
  }
}

// Sort buy prices low to high
buyPrices.sort((a, b) => {
  return a.toNumber() - b.toNumber();
});

// Sort sell prices hihg to low
sellPrices.sort((a, b) => {
  return b.toNumber() - a.toNumber();
});

let buyAmount = new BigNumber(0);
let sellAmount = new BigNumber(0);
for (let b of buyPrices) {
  buyAmount = buyAmount.plus(b);
}
for (let s of sellPrices) {
  sellAmount = sellAmount.plus(s);
}

let totalSpreadFee = new BigNumber(0);
for (let i = 0; i < Math.min(sellPrices.length, buyPrices.length); i++) {
  let spread = sellPrices[i].minus(buyPrices[i]);
  totalSpreadFee = totalSpreadFee.plus(spread);
}
totalSpreadFee = totalSpreadFee.div(new BigNumber(10**18));

let scalingFactor = new BigNumber(Math.min(buyCount, sellCount));
let avgBuyPrice = buyAmount.div(new BigNumber(buyCount)).div(new BigNumber(10**18));
let avgSellPrice = sellAmount.div(new BigNumber(sellCount)).div(new BigNumber(10**18));
console.log(
  '\nBuy Count ', buyCount, 
  '\nBuy Amount (unscaled)', buyAmount.toString(), 
  '\nAvg Buy Price (in ETH)', avgBuyPrice.toString(),
  '\nSell Count ', sellCount, 
  '\nSell Amount (unscaled)', sellAmount.toString(),
  '\nAvg Sell Price (in ETH)', avgSellPrice.toString(),
  '\nAvg Spread Earned (in ETH)', scalingFactor.times(avgSellPrice.minus(avgBuyPrice)).toString(),
  '\nTotal Spread Earned (in ETH)', totalSpreadFee.toString()
);