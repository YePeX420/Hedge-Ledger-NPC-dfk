/**
 * @fileoverview Tests consumable functionality.
 */

const { ethers } = require('ethers');

const { getProvider } = require('../src/ether');
const consumableAbi = require('../src/abi/consumable.abi.json');
const { itemConsumedEventFix } = require('../test/fixtures/consumable.fix');
// const allItems = require('../src/constants/all-items.json');
const allItems = require('./all-items-raw.json');

const STAMPOT_CONSUME_TX =
  '0x454d152b2456243b3450c3747f37e8a5c40e959420f75043977087926736482a';

async function run() {
  const { provider } = await getProvider();

  const ifaceConsumable = new ethers.utils.Interface(consumableAbi);
  const receipt = await provider.getTransactionReceipt(STAMPOT_CONSUME_TX);

  const itemConsumedEvent = itemConsumedEventFix();
  const dec = ifaceConsumable.parseLog(itemConsumedEvent);
  console.log('DECODED:', dec);

  receipt.logs.forEach((logItem) => {
    try {
      const decoded = ifaceConsumable.parseLog(logItem);
      console.log('logItem', logItem);
      console.log('logItem LENGTH', logItem.data.length, typeof logItem.data);
      console.log(`\n\n${logItem.data}\n\n`);
      process.stdout.write(logItem.data);
      console.log('itemConsumedEvent:', itemConsumedEvent.data.length);
      console.log('DECODED:', decoded);
    } catch (ex) {}
  });
}

const DFKC = '53935';
const HMY = '1666600000';
const ZERO = '0x0000000000000000000000000000000000000001';

async function extractForSisyphus() {
  const sisyphusArray = [];
  allItems.forEach((item) => {
    if (item.addresses[DFKC] && item.addresses[DFKC] !== ZERO) {
      sisyphusArray.push([DFKC, item.addresses[DFKC].toLowerCase(), item.name]);
    }
    if (item.addresses[HMY] && item.addresses[HMY] !== ZERO) {
      sisyphusArray.push([HMY, item.addresses[HMY].toLowerCase(), item.name]);
    }
  });

  const outputAr = sisyphusArray.map((item) => {
    return `['${item[0]}', '${item[1]}', '${item[2]}'],`;
  });

  const output = outputAr.join('\n');

  console.log(output);
}

extractForSisyphus();
