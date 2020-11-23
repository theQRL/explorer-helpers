/* eslint no-console: 0 */
var _ = require('underscore');
var math = require('mathjs');
var HTTPS = require('axios');
var bech32 = require('bech32');
var sha256 = require('sha256');
var SHOR_PER_QUANTA = 1000000000;

function numberToString(num) {
  return math.format(num, {
    notation: 'fixed',
    lowerExp: 1e-100,
    upperExp: Infinity,
  });
}

function hexToString(input) {
  var hex = input.toString();
  var str = '';
  for (var n = 0; n < hex.length; n += 2) {
    str += String.fromCharCode(parseInt(hex.substr(n, 2), 16));
  }
  return str;
}

function toHexString(byteArray) {
  return Array.from(byteArray, function(byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('')
}

function hexToBytes(hex) {
  for (var bytes = [], c = 0; c < hex.length; c += 2)
    bytes.push(parseInt(hex.substr(c, 2), 16));
  return bytes;
}

function isCoinbaseAddress(descriptorAndHash) {
  function zeroTest(element) {
    return element === 0;
  }
  return descriptorAndHash.every(zeroTest);
}

const apiCall = async (apiUrl) => {
  try {
    const response = await HTTPS.get(apiUrl);
    return response.data;
  } catch (error) {
    console.log(error);
  }
};

function b32Encode(input) {
  return bech32.encode('q', bech32.toWords(input));
}

function b32Decode(input) {
  const a = bech32.decode(input);
  if (a.prefix !== 'q') {
    throw 'This is not a QRL address';
  }
  return Uint8Array.from(bech32.fromWords(a.words));
}

// Hexstring Address to BECH32 Address
function hexAddressToB32Address(hexAddress) {
  const bin = Buffer.from(hexAddress.substring(1), 'hex');
  const descriptorAndHash = bin.slice(0, 35);
  return b32Encode(descriptorAndHash);
}

function b32AddressToRawAddress(b32Address) {
  const descriptorAndHash = Buffer.from(b32Decode(b32Address));

  // The Raw Coinbase Address is special, and does not need the 4 byte checksum at the end.
  if (isCoinbaseAddress(descriptorAndHash)) {
    return descriptorAndHash;
  }
  const ck = sha256(descriptorAndHash, { asBytes: true });
  const ckSlice = Buffer.from(ck.slice(28, 32));
  const answer = Buffer.concat([descriptorAndHash, ckSlice]);
  return answer;
}

function hexAddressToRawAddress(hexAddress) {
  return Buffer.from(hexAddress.substring(1), 'hex');
}

function b32AddressToHexAddress(b32Address) {
  const rawAddress = b32AddressToRawAddress(b32Address);
  return `Q${Buffer.from(rawAddress).toString('hex')}`;
}

// Raw Address to BECH32 Address
function rawAddressToB32Address(rawAddress) {
  rawAddress = Buffer.from(rawAddress); // Sometimes it can just be a JS object, e.g. from a JSON test input
  const descriptorAndHash = rawAddress.slice(0, 35);
  return b32Encode(descriptorAndHash);
}

function rawAddressToHexAddress(rawAddress) {
  return `Q${Buffer.from(rawAddress).toString('hex')}`;
}

function compareB32HexAddresses(b32Address, hexAddress) {
  const b32Raw = b32AddressToRawAddress(b32Address);
  const hexRaw = hexAddressToRawAddress(hexAddress);
  return b32Raw.equals(hexRaw); // JS/Buffer oddity: === actually compares if they point to the same object, not if the objects have the same content
}

function parseTokenTx(input) {
  const output = input;
  output.transaction.tx.token.initial_balances.forEach((value) => {
    const edit = value;
    // eslint-disable-next-line
    edit.amount = numberToString(edit.amount / Math.pow(10, output.transaction.tx.token.decimals));
  });

  const balancesForExplorer = [];
  output.transaction.tx.token.initial_balances.forEach((value) => {
    const o = {
      address_hex: rawAddressToHexAddress(value.address),
      address_b32: rawAddressToB32Address(value.address),
      amount: value.amount,
    };
    balancesForExplorer.push(o);
  });

  output.transaction.tx.addr_from = output.transaction.addr_from;
  output.transaction.tx.public_key = Buffer.from(output.transaction.tx.public_key).toString('hex');
  output.transaction.tx.signature = Buffer.from(output.transaction.tx.signature).toString('hex');
  // eslint-disable-next-line
  output.transaction.tx.token.symbol = Buffer.from(output.transaction.tx.token.symbol).toString();
  output.transaction.tx.token.name = Buffer.from(output.transaction.tx.token.name).toString();
  // output.transaction.tx.token.owner = output.transaction.tx.token.owner <-- REDUNDANT

  output.transaction.tx.fee = numberToString(output.transaction.tx.fee / SHOR_PER_QUANTA);
  output.transaction.explorer = {
    from_hex: rawAddressToHexAddress(output.transaction.tx.addr_from),
    from_b32: rawAddressToB32Address(output.transaction.tx.addr_from),
    to_hex: rawAddressToHexAddress(output.transaction.tx.addr_from),
    to_b32: rawAddressToB32Address(output.transaction.tx.addr_from),
    signature: output.transaction.tx.signature,
    publicKey: output.transaction.tx.public_key,
    symbol: output.transaction.tx.token.symbol,
    name: output.transaction.tx.token.name,
    decimals: output.transaction.tx.token.decimals,
    owner_hex: rawAddressToHexAddress(output.transaction.tx.token.owner),
    owner_b32: rawAddressToB32Address(output.transaction.tx.token.owner),
    initialBalances: balancesForExplorer,
    type: 'CREATE TOKEN',
  };
  return output;
}

function parseTransferTokenTx(output) {
  // Calculate total transferred, and generate a clean structure to display outputs from
  // let thisTotalTransferred = 0;
  const thisOutputs = [];
  _.each(output.transaction.tx.transfer_token.addrs_to, (thisAddress, index) => {
    const thisOutput = {
      // eslint-disable-next-line
      amount: '',
    };
    thisOutputs.push(thisOutput);
    // Now update total transferred with the corresponding amount from this output
    // eslint-disable-next-line
    thisTotalTransferred += parseInt(output.transaction.tx.transfer_token.amounts[index], 10);
  });

  const outputsForExplorer = [];
  _.each(output.transaction.tx.transfer_token.addrs_to, (thisAddress) => {
    const o = {
      address_hex: rawAddressToHexAddress(thisAddress),
      address_b32: rawAddressToB32Address(thisAddress),
      // eslint-disable-next-line
      amount: '',
    };
    outputsForExplorer.push(o);
  });

  output.transaction.tx.fee = numberToString(output.transaction.tx.fee / SHOR_PER_QUANTA);
  output.transaction.tx.addr_from = output.transaction.addr_from;
  output.transaction.tx.public_key = Buffer.from(output.transaction.tx.public_key).toString('hex');
  output.transaction.tx.signature = Buffer.from(output.transaction.tx.signature).toString('hex');
  output.transaction.tx.transfer_token.token_txhash = Buffer.from(output.transaction.tx.transfer_token.token_txhash).toString('hex');
  output.transaction.tx.transfer_token.outputs = thisOutputs;
  // eslint-disable-next-line
  output.transaction.tx.totalTransferred = '';

  output.transaction.explorer = {
    from_hex: rawAddressToHexAddress(output.transaction.tx.addr_from),
    from_b32: rawAddressToB32Address(output.transaction.tx.addr_from),
    outputs: outputsForExplorer,
    signature: output.transaction.tx.signature,
    publicKey: output.transaction.tx.public_key,
    token_txhash: output.transaction.tx.transfer_token.token_txhash,
    // eslint-disable-next-line
    totalTransferred: '',
    type: 'TRANSFER TOKEN',
  };
  return output;
}

function parseTokenAndTransferTokenTx(responseTokenTx, responseTransferTokenTx) {
  // Transform Block Metadata into human readable form, just like in txhash()
  // Use TransferToken's Block Metadata, not TokenTx's
  const output = JSON.parse(JSON.stringify(responseTransferTokenTx)); // Best way to deep copy in JS

  output.transaction.tx.transaction_hash = Buffer.from(output.transaction.tx.transaction_hash).toString('hex');
  if (output.transaction.header !== null) {
    // If we are in here, it's a confirmed transaction.
    output.transaction.header.hash_header = Buffer.from(output.transaction.header.hash_header).toString('hex');
    output.transaction.header.hash_header_prev = Buffer.from(output.transaction.header.hash_header_prev).toString('hex');
    output.transaction.header.merkle_root = Buffer.from(output.transaction.header.merkle_root).toString('hex');
    output.transaction.tx.amount = '';
  }

  // Get relevant information from TokenTx
  const thisSymbol = Buffer.from(responseTokenTx.transaction.tx.token.symbol).toString();
  const thisName = Buffer.from(responseTokenTx.transaction.tx.token.name).toString();
  const thisDecimals = responseTokenTx.transaction.tx.token.decimals;

  // Calculate total transferred, and generate a clean structure to display outputs from
  let thisTotalTransferred = 0;
  const thisOutputs = [];
  _.each(output.transaction.tx.transfer_token.addrs_to, (thisAddress, index) => {
    const thisOutput = {
      address: thisAddress,
      // eslint-disable-next-line
      amount: numberToString(output.transaction.tx.transfer_token.amounts[index] / Math.pow(10, thisDecimals)),
    };
    thisOutputs.push(thisOutput);
    // Now update total transferred with the corresponding amount from this output
    // eslint-disable-next-line
    thisTotalTransferred += parseInt(output.transaction.tx.transfer_token.amounts[index], 10);
  });

  const outputsForExplorer = [];
  _.each(output.transaction.tx.transfer_token.addrs_to, (thisAddress, index) => {
    const o = {
      address_hex: rawAddressToHexAddress(thisAddress),
      address_b32: rawAddressToB32Address(thisAddress),
      // eslint-disable-next-line
      amount: numberToString(output.transaction.tx.transfer_token.amounts[index] / Math.pow(10, thisDecimals)),
    };
    outputsForExplorer.push(o);
  });
  output.transaction.tx.fee = numberToString(output.transaction.tx.fee / SHOR_PER_QUANTA);
  output.transaction.tx.addr_from = output.transaction.addr_from;
  output.transaction.tx.public_key = Buffer.from(output.transaction.tx.public_key).toString('hex');
  output.transaction.tx.signature = Buffer.from(output.transaction.tx.signature).toString('hex');
  output.transaction.tx.transfer_token.token_txhash = Buffer.from(output.transaction.tx.transfer_token.token_txhash).toString('hex');
  output.transaction.tx.transfer_token.outputs = thisOutputs;
  // eslint-disable-next-line
  output.transaction.tx.totalTransferred = numberToString(thisTotalTransferred / Math.pow(10, thisDecimals));

  output.transaction.explorer = {
    from_hex: rawAddressToHexAddress(output.transaction.tx.addr_from),
    from_b32: rawAddressToB32Address(output.transaction.tx.addr_from),
    outputs: outputsForExplorer,
    signature: output.transaction.tx.signature,
    publicKey: output.transaction.tx.public_key,
    token_txhash: output.transaction.tx.transfer_token.token_txhash,
    // eslint-disable-next-line
    totalTransferred: numberToString(thisTotalTransferred / Math.pow(10, thisDecimals)),
    symbol: thisSymbol,
    name: thisName,
    type: 'TRANSFER TOKEN',
  };
  return output;
}

function parseTransferTx(output) {
  // Calculate total transferred, and generate a clean structure to display outputs from
  let thisTotalTransferred = 0;
  const thisOutputs = [];
  _.each(output.transaction.tx.transfer.addrs_to, (thisAddress, index) => {
    const thisOutput = {
      address: thisAddress,
      amount: numberToString(output.transaction.tx.transfer.amounts[index] / SHOR_PER_QUANTA),
    };
    thisOutputs.push(thisOutput);
    // Now update total transferred with the corresponding amount from this output
    thisTotalTransferred += parseInt(output.transaction.tx.transfer.amounts[index], 10);
  });

  const outputsForExplorer = [];
  _.each(output.transaction.tx.transfer.addrs_to, (thisAddress, index) => {
    const thisOutput = {
      address_hex: rawAddressToHexAddress(thisAddress),
      address_b32: rawAddressToB32Address(thisAddress),
      amount: numberToString(output.transaction.tx.transfer.amounts[index] / SHOR_PER_QUANTA),
    };
    outputsForExplorer.push(thisOutput);
  });
  output.transaction.tx.transfer.message_data = Buffer.from(output.transaction.tx.transfer.message_data).toString();
  output.transaction.tx.addr_from = output.transaction.addr_from;
  output.transaction.tx.transfer.outputs = thisOutputs;
  output.transaction.tx.amount = numberToString(thisTotalTransferred / SHOR_PER_QUANTA);
  output.transaction.tx.fee = numberToString(output.transaction.tx.fee / SHOR_PER_QUANTA);
  output.transaction.tx.public_key = Buffer.from(output.transaction.tx.public_key).toString('hex');
  output.transaction.tx.signature = Buffer.from(output.transaction.tx.signature).toString('hex');
  output.transaction.explorer = {
    from_hex: rawAddressToHexAddress(output.transaction.tx.addr_from),
    from_b32: rawAddressToB32Address(output.transaction.tx.addr_from),
    outputs: outputsForExplorer,
    totalTransferred: numberToString(thisTotalTransferred / SHOR_PER_QUANTA),
    type: 'TRANSFER',
  };
  return output;
}

function parseSlaveTx(output) {
  output.transaction.tx.fee = numberToString(output.transaction.tx.fee / SHOR_PER_QUANTA);

  output.transaction.tx.public_key = Buffer.from(output.transaction.tx.public_key).toString('hex');
  output.transaction.tx.signature = Buffer.from(output.transaction.tx.signature).toString('hex');
  output.transaction.tx.addr_from = output.transaction.addr_from;
  output.transaction.tx.slave.slave_pks.forEach((value, index) => {
    output.transaction.tx.slave.slave_pks[index] = Buffer.from(value).toString('hex');
  });

  output.transaction.explorer = {
    from_hex: rawAddressToHexAddress(output.transaction.tx.addr_from),
    from_b32: rawAddressToB32Address(output.transaction.tx.addr_from),
    to_hex: '',
    to_b32: '',
    signature: output.transaction.tx.signature,
    publicKey: output.transaction.tx.public_key,
    amount: output.transaction.tx.amount,
    type: 'SLAVE',
  };
  return output;
}

function parseLatticePkTx(output) {
  output.transaction.tx.fee = numberToString(output.transaction.tx.fee / SHOR_PER_QUANTA);

  output.transaction.tx.addr_from = output.transaction.addr_from;

  output.transaction.explorer = {
    from_hex: rawAddressToHexAddress(output.transaction.tx.addr_from),
    from_b32: rawAddressToB32Address(output.transaction.tx.addr_from),
    to_hex: '',
    to_b32: '',
    signature: output.transaction.tx.signature,
    publicKey: output.transaction.tx.public_key,
    amount: output.transaction.tx.amount,
    type: 'LATTICE PK',
  };
  output.transaction.addr_from = Buffer.from(output.transaction.addr_from).toString('hex');
  output.transaction.tx.addr_from = Buffer.from(output.transaction.tx.addr_from).toString('hex');
  return output;
}

function parseMultiSigCreateTx(output) {
  try {
    output.transaction.tx.fee = numberToString(output.transaction.tx.fee / SHOR_PER_QUANTA);
    output.transaction.tx.public_key = Buffer.from(output.transaction.tx.public_key).toString('hex');
    output.transaction.tx.signature = Buffer.from(output.transaction.tx.signature).toString('hex');

    output.transaction.tx.master_addr = Buffer.from(output.transaction.tx.master_addr).toString('hex');
    output.transaction.explorer = {
      from_hex: rawAddressToHexAddress(output.transaction.addr_from),
      from_b32: rawAddressToB32Address(output.transaction.addr_from),
      signature: output.transaction.tx.signature,
      publicKey: output.transaction.tx.public_key,
      type: 'MULTISIG_CREATE',
    };

    output.transaction.addr_from = Buffer.from(output.transaction.addr_from).toString('hex');
    // output.transaction.tx.addr_from = Buffer.from(output.transaction.tx.addr_from).toString('hex')
    output.transaction.tx.master_addr = Buffer.from(output.transaction.tx.master_addr).toString('hex');

    const formattedSignatories = [];
    _.each(output.transaction.tx.multi_sig_create.signatories, (thisAddress) => {
      formattedSignatories.push(Buffer.from(thisAddress).toString('hex'));
    });
    output.transaction.tx.multi_sig_create.signatories = formattedSignatories;
  } catch (error) {
    // catch to ensure output is returned
    console.log(error);
  }
  return output;
}

function parseMultiSigVoteTx(output) {
  try {
    output.transaction.tx.fee = numberToString(output.transaction.tx.fee / SHOR_PER_QUANTA);
    output.transaction.tx.public_key = Buffer.from(output.transaction.tx.public_key).toString('hex');
    output.transaction.tx.signature = Buffer.from(output.transaction.tx.signature).toString('hex');

    output.transaction.tx.master_addr = Buffer.from(output.transaction.tx.master_addr).toString('hex');
    output.transaction.explorer = {
      from_hex: rawAddressToHexAddress(output.transaction.addr_from),
      from_b32: rawAddressToB32Address(output.transaction.addr_from),
      signature: output.transaction.tx.signature,
      publicKey: output.transaction.tx.public_key,
      type: 'MULTISIG_VOTE',
    };

    output.transaction.addr_from = Buffer.from(output.transaction.addr_from).toString('hex');
    // output.transaction.tx.addr_from = Buffer.from(output.transaction.tx.addr_from).toString('hex')
    output.transaction.tx.master_addr = Buffer.from(output.transaction.tx.master_addr).toString('hex');

    output.transaction.tx.multi_sig_vote.shared_key = Buffer.from(output.transaction.tx.multi_sig_vote.shared_key).toString('hex');
    output.transaction.tx.multi_sig_vote.prev_tx_hash = Buffer.from(output.transaction.tx.multi_sig_vote.prev_tx_hash).toString('hex');
  } catch (error) {
    // catch to ensure output is returned
    console.log(error);
  }
  return output;
}

function parseMultiSigSpendTx(output) {
  try {
    output.transaction.tx.fee = numberToString(output.transaction.tx.fee / SHOR_PER_QUANTA);
    output.transaction.tx.public_key = Buffer.from(output.transaction.tx.public_key).toString('hex');
    output.transaction.tx.signature = Buffer.from(output.transaction.tx.signature).toString('hex');
    output.transaction.tx.multi_sig_spend.multi_sig_address = Buffer.from(output.transaction.tx.multi_sig_spend.multi_sig_address).toString('hex');
    output.transaction.tx.master_addr = Buffer.from(output.transaction.tx.master_addr).toString('hex');
    output.transaction.explorer = {
      from_hex: rawAddressToHexAddress(output.transaction.addr_from),
      from_b32: rawAddressToB32Address(output.transaction.addr_from),
      signature: output.transaction.tx.signature,
      publicKey: output.transaction.tx.public_key,
      type: 'MULTISIG_SPEND',
    };

    output.transaction.addr_from = Buffer.from(output.transaction.addr_from).toString('hex');
    // output.transaction.tx.addr_from = Buffer.from(output.transaction.tx.addr_from).toString('hex')
    output.transaction.tx.master_addr = Buffer.from(output.transaction.tx.master_addr).toString('hex');

    const formattedSignatories = [];
    _.each(output.transaction.tx.multi_sig_spend.addrs_to, (thisAddress) => {
      formattedSignatories.push(Buffer.from(thisAddress).toString('hex'));
    });
    output.transaction.tx.multi_sig_spend.addrs_to = formattedSignatories;
  } catch (error) {
    // catch to ensure output is returned
    console.log(error);
  }
  return output;
}

function parseMessageTx(input) {
  const output = input;
  output.transaction.tx.fee = numberToString(output.transaction.tx.fee / SHOR_PER_QUANTA);
  output.transaction.tx.addr_from = output.transaction.addr_from;
  output.transaction.tx.public_key = Buffer.from(output.transaction.tx.public_key).toString('hex');
  output.transaction.tx.signature = Buffer.from(output.transaction.tx.signature).toString('hex');

  // Check if message_hash is encoded message
  const hexMessage = Buffer.from(output.transaction.tx.message.message_hash).toString('hex');
  if (hexMessage.substring(0, 4) === 'afaf') {
    // Found encoded message
    const messageType = hexMessage.substring(4, 5);

    // Document Notarisation
    if (messageType === 'a') {
      const hashType = hexMessage.substring(5, 6);

      // Define place for hash and text to live
      let thisHash;
      let thisText;
      let thisHashFunction;

      // SHA1
      if (hashType === '1') {
        thisHash = hexMessage.substring(6, 46);
        thisText = hexToString(hexMessage.substring(46));
        thisHashFunction = 'SHA1';
        // SHA256
      } else if (hashType === '2') {
        thisHash = hexMessage.substring(6, 70);
        thisText = hexToString(hexMessage.substring(70));
        thisHashFunction = 'SHA256';
        // MD5
      } else if (hashType === '3') {
        thisHash = hexMessage.substring(6, 38);
        thisText = hexToString(hexMessage.substring(38));
        thisHashFunction = 'MD5';
      }

      // Save output as DOCUMENT_NOTARISAION txn type
      output.transaction.explorer = {
        from_hex: rawAddressToHexAddress(output.transaction.tx.addr_from),
        from_b32: rawAddressToB32Address(output.transaction.tx.addr_from),
        signature: output.transaction.tx.signature,
        publicKey: output.transaction.tx.public_key,
        hash: thisHash,
        hash_function: thisHashFunction,
        text: thisText,
        raw: hexMessage,
        type: 'DOCUMENT_NOTARISATION',
      };
      return output;
    }
  }
  if (hexMessage.substring(0, 8) === '0f0f0002') {
    const x = Buffer.from(output.transaction.tx.message.message_hash, 'hex');
    let kbType = 'error';
    if (hexMessage.substring(8, 10) === 'af') {
      kbType = 'remove';
    }
    if (hexMessage.substring(8, 10) === 'aa') {
      kbType = 'add';
    }
    let kbUser = '';
    let spaceIndex = 0;
    for (let i = 12; i < hexMessage.length; i = i + 2) {
      if (hexMessage.substring(i, i + 2) === '20' && spaceIndex === 0) {
        spaceIndex = i;
      }
    }

    kbUser = hexToString(hexMessage.substring(12, spaceIndex));
    let kbHex = hexMessage.slice(spaceIndex + 2, hexMessage.length);
    kbHex = kbHex.toString('hex');

    // Found encoded message

    output.transaction.tx.message.message_hash = Buffer.from(output.transaction.tx.message.message_hash).toString();
    output.transaction.explorer = {
      from_hex: rawAddressToHexAddress(output.transaction.tx.addr_from),
      from_b32: rawAddressToB32Address(output.transaction.tx.addr_from),
      signature: output.transaction.tx.signature,
      publicKey: output.transaction.tx.public_key,
      message: output.transaction.tx.message.message_hash,
      keybaseUser: kbUser,
      keybaseType: kbType,
      keybaseHex: kbHex,
      type: 'KEYBASE',
    };
    return output;
  }

  output.transaction.tx.message.message_hash = Buffer.from(output.transaction.tx.message.message_hash).toString();
  output.transaction.explorer = {
    from_hex: rawAddressToHexAddress(output.transaction.tx.addr_from),
    from_b32: rawAddressToB32Address(output.transaction.tx.addr_from),
    signature: output.transaction.tx.signature,
    publicKey: output.transaction.tx.public_key,
    message: output.transaction.tx.message.message_hash,
    type: 'MESSAGE',
  };
  return output;
}

function parseCoinbaseTx(output) {
  output.transaction.tx.addr_from = output.transaction.addr_from;
  output.transaction.tx.addr_to = output.transaction.tx.coinbase.addr_to;
  // output.transaction.tx.coinbase.addr_to = output.transaction.tx.coinbase.addr_to <--- REDUNDANT
  // eslint-disable-next-line
  output.transaction.tx.amount = numberToString(output.transaction.tx.coinbase.amount / SHOR_PER_QUANTA);

  output.transaction.explorer = {
    from_hex: '',
    from_b32: '',
    to_hex: rawAddressToHexAddress(output.transaction.tx.addr_to),
    to_b32: rawAddressToB32Address(output.transaction.tx.addr_to),
    type: 'COINBASE',
  };
  return output;
}

async function getQRLprice() {
  try {
    const apiUrl = 'https://bittrex.com/api/v1.1/public/getmarketsummary?market=btc-qrl';
    const apiUrlUSD = 'https://bittrex.com/api/v1.1/public/getmarketsummary?market=usdt-btc';
    let b = await apiCall(apiUrl);
    let c = await apiCall(apiUrlUSD);
    return [b, c];
  } catch (e) {
    console.log(e.message);
  }
}

function addMessageDetail(hexMessage) {
  if (hexMessage.substring(0, 4) === 'afaf') {
    // Found encoded message
    const messageType = hexMessage.substring(4, 5);

    // Document Notarisation
    if (messageType === 'a') {
      const hashType = hexMessage.substring(5, 6);

      // Define place for hash and text to live
      let thisHash;
      let thisText;
      let thisHashFunction;

      // SHA1
      if (hashType === '1') {
        thisHash = hexMessage.substring(6, 46);
        thisText = hexToString(hexMessage.substring(46));
        thisHashFunction = 'SHA1';
        // SHA256
      } else if (hashType === '2') {
        thisHash = hexMessage.substring(6, 70);
        thisText = hexToString(hexMessage.substring(70));
        thisHashFunction = 'SHA256';
        // MD5
      } else if (hashType === '3') {
        thisHash = hexMessage.substring(6, 38);
        thisText = hexToString(hexMessage.substring(38));
        thisHashFunction = 'MD5';
      }

      // Save output as DOCUMENT_NOTARISAION txn type
      const explorer = {
        hash: thisHash,
        hash_function: thisHashFunction,
        text: thisText,
        raw: hexMessage,
        type: 'DOCUMENT_NOTARISATION',
      };
      return explorer;
    }
  }

  if (hexMessage.substring(0, 8) === '0f0f0002') {
    let kbType = 'error';
    if (hexMessage.substring(8, 10) === 'af') {
      kbType = 'remove';
    }
    if (hexMessage.substring(8, 10) === 'aa') {
      kbType = 'add';
    }
    let kbUser = '';
    let spaceIndex = 0;
    for (let i = 12; i < hexMessage.length; i = i + 2) {
      if (hexMessage.substring(i, i + 2) === '20' && spaceIndex === 0) {
        spaceIndex = i;
      }
    }

    kbUser = hexToString(hexMessage.substring(12, spaceIndex));
    let kbHex = hexMessage.slice(spaceIndex + 2, hexMessage.length);
    kbHex = kbHex.toString('hex');

    // Found encoded message
    const output = {
      keybaseUser: kbUser,
      keybaseType: kbType,
      keybaseSignature: kbHex,
      raw: hexMessage,
      type: 'KEYBASE',
    };
    return output;
  }
  // standard message
  const message = Buffer.from(hexMessage).toString();
  const explorer = {
    raw: hexMessage,
    message: hexToString(message),
    type: 'MESSAGE',
  };
  return explorer;
}

function apiv2A(input) {
  const output = input;
  output.state.foundation_multi_sig_spend_txn_hash = Buffer.from(output.state.foundation_multi_sig_spend_txn_hash).toString('hex');
  output.state.foundation_multi_sig_vote_txn_hash = Buffer.from(output.state.foundation_multi_sig_vote_txn_hash).toString('hex');
  output.state.address = `Q${Buffer.from(output.state.address).toString('hex')}`;
  return output;
}

function apiv2Block(input) {
  const output = input;

  output.block_extended.header.hash_header = Buffer.from(output.block_extended.header.hash_header).toString('hex');
  output.block_extended.header.hash_header_prev = Buffer.from(output.block_extended.header.hash_header_prev).toString('hex');
  output.block_extended.header.merkle_root = Buffer.from(output.block_extended.header.merkle_root).toString('hex');
  const extendedTransactions = [];
  _.each(output.block_extended.extended_transactions, (item) => {
    // console.log('**item**')
    // console.log(item)
    // console.log('^^^ end item ^^^')
    const r = item;
    r.tx.master_addr = Buffer.from(r.tx.master_addr).toString('hex');
    if (r.tx.master_addr.length > 0) {
      r.tx.master_addr = `Q${r.tx.master_addr}`;
    }
    r.tx.public_key = Buffer.from(r.tx.public_key).toString('hex');
    r.tx.signature = Buffer.from(r.tx.signature).toString('hex');
    r.tx.transaction_hash = Buffer.from(r.tx.transaction_hash).toString('hex');
    r.addr_from = `Q${Buffer.from(r.addr_from).toString('hex')}`;
    r.explorer = {};
    // COINBASE
    if (r.tx.coinbase) {
      r.tx.coinbase.addr_to = `Q${Buffer.from(r.tx.coinbase.addr_to).toString('hex')}`;
    }
    // TRANSFER
    if (r.tx.transfer) {
      r.tx.transfer.message_data = Buffer.from(r.tx.transfer.message_data).toString();
      const addrs = [];
      _.each(r.tx.transfer.addrs_to, (a) => {
        addrs.push(`Q${Buffer.from(a).toString('hex')}`);
      });
      r.tx.transfer.addrs_to = addrs;
    }
    // SLAVE transaction type
    if (r.tx.slave) {
      r.tx.slave.slave_pks.forEach((value, index) => {
        r.tx.slave.slave_pks[index] = Buffer.from(value).toString('hex');
      });
    }
    // MULTI_SIG_CREATE
    if (r.tx.multi_sig_create) {
      const sigs = [];
      _.each(r.tx.multi_sig_create.signatories, (s) => {
        sigs.push(`Q${Buffer.from(s).toString('hex')}`);
      });
      r.tx.multi_sig_create.signatories = sigs;
    }

    // MULTI_SIG_SPEND
    if (r.tx.multi_sig_spend) {
      const addr = [];
      _.each(r.tx.multi_sig_spend.addrs_to, (s) => {
        addr.push(`Q${Buffer.from(s).toString('hex')}`);
      });
      r.tx.multi_sig_spend.addrs_to = addr;
      r.tx.multi_sig_spend.multi_sig_address = `Q${Buffer.from(r.tx.multi_sig_spend.multi_sig_address).toString('hex')}`;
    }

    // MULTI_SIG_VOTE
    if (r.tx.multi_sig_vote) {
      r.tx.multi_sig_vote.prev_tx_hash = Buffer.from(r.tx.multi_sig_vote.prev_tx_hash).toString('hex');
      r.tx.multi_sig_vote.shared_key = Buffer.from(r.tx.multi_sig_vote.shared_key).toString('hex');
    }

    // MESSAGE
    if (r.tx.message) {
      r.tx.message.message_hash = Buffer.from(r.tx.message.message_hash).toString('hex');
      r.tx.message.addr_to = Buffer.from(r.tx.message.addr_to).toString('hex');
      if (r.tx.message.addr_to.length > 1) {
        r.tx.message.addr_to = `Q${r.tx.message.addr_to}`;
      }
      r.explorer.message = addMessageDetail(r.tx.message.message_hash);
    }

    // TOKEN_CREATE
    if (r.tx.token) {
      r.tx.token.symbol = Buffer.from(r.tx.token.symbol).toString();
      r.tx.token.name = Buffer.from(r.tx.token.name).toString();
      r.tx.token.owner = `Q${Buffer.from(r.tx.token.owner).toString('hex')}`;
      const addrs = [];
      _.each(r.tx.token.initial_balances, (bal) => {
        addrs.push({
          address: `Q${Buffer.from(bal.address).toString('hex')}`,
          amount: bal.amount,
        });
        r.tx.token.initial_balances = addrs;
      });
    }
    extendedTransactions.push(r);
  });
  output.block_extended.extended_transactions = extendedTransactions;
  return output;
}

function apiv2Tx(input, confirmed) {
  const output = input;

  output.transaction.tx.public_key = Buffer.from(output.transaction.tx.public_key).toString('hex');
  output.transaction.tx.signature = Buffer.from(output.transaction.tx.signature).toString('hex');
  output.transaction.tx.master_addr = Buffer.from(output.transaction.tx.master_addr).toString('hex');
  if (output.transaction.tx.master_addr.length > 0) {
    output.transaction.tx.master_addr = `Q${output.transaction.tx.master_addr}`;
  }
  output.transaction.tx.transaction_hash = Buffer.from(output.transaction.tx.transaction_hash).toString('hex');

  // explorer object
  output.explorer = { found: output.found };

  // TRANSFER transaction type
  if (output.transaction.tx.transfer) {
    output.transaction.tx.transfer.message_data = Buffer.from(output.transaction.tx.transfer.message_data).toString();
    const outputsForExplorer = [];
    _.each(output.transaction.tx.transfer.addrs_to, (thisAddress) => {
      outputsForExplorer.push(`Q${Buffer.from(thisAddress).toString('hex')}`);
    });
    output.transaction.tx.transfer.addrs_to = outputsForExplorer;
  }

  // MULTI_SIG_CREATE transaction type
  if (output.transaction.tx.multi_sig_create) {
    const sigs = [];
    _.each(output.transaction.tx.multi_sig_create.signatories, (s) => {
      sigs.push(`Q${Buffer.from(s).toString('hex')}`);
    });
    output.transaction.tx.multi_sig_create.signatories = sigs;

    // fetch MS address
    const desc = hexToBytes('110000')
    const txhash = hexToBytes(output.transaction.tx.transaction_hash)
    const arr = desc.concat(txhash)
    const prevHash = hexToBytes(sha256(arr))
    const newArr = desc.concat(prevHash)
    const newHash = hexToBytes(sha256(newArr).slice(56, 64))
    const q1 = desc.concat(prevHash)
    const q = q1.concat(newHash)
    output.explorer.multisigAddress = `Q${toHexString(q)}`

  }

  // SLAVE transaction type
  if (output.transaction.tx.slave) {
    output.transaction.tx.slave.slave_pks.forEach((value, index) => {
      output.transaction.tx.slave.slave_pks[index] = Buffer.from(value).toString('hex');
    });
  }

  // COINBASE transaction type
  if (output.transaction.tx.coinbase) {
    output.transaction.tx.coinbase.addr_to = `Q${Buffer.from(output.transaction.tx.coinbase.addr_to).toString('hex')}`;
  }

  // MULTI_SIG_SPEND
  if (output.transaction.tx.multi_sig_spend) {
    const addr = [];
    _.each(output.transaction.tx.multi_sig_spend.addrs_to, (s) => {
      addr.push(`Q${Buffer.from(s).toString('hex')}`);
    });
    output.transaction.tx.multi_sig_spend.addrs_to = addr;
    output.transaction.tx.multi_sig_spend.multi_sig_address = `Q${Buffer.from(output.transaction.tx.multi_sig_spend.multi_sig_address).toString('hex')}`;
  }

  // MULTI_SIG_VOTE
  if (output.transaction.tx.multi_sig_vote) {
    output.transaction.tx.multi_sig_vote.prev_tx_hash = Buffer.from(output.transaction.tx.multi_sig_vote.prev_tx_hash).toString('hex');
    output.transaction.tx.multi_sig_vote.shared_key = Buffer.from(output.transaction.tx.multi_sig_vote.shared_key).toString('hex');
  }

  // MESSAGE
  if (output.transaction.tx.message) {
    output.transaction.tx.message.message_hash = Buffer.from(output.transaction.tx.message.message_hash).toString('hex');
    output.transaction.tx.message.addr_to = Buffer.from(output.transaction.tx.message.addr_to).toString('hex');
    if (output.transaction.tx.message.addr_to.length > 1) {
      output.transaction.tx.message.addr_to = `Q${output.transaction.tx.message.addr_to}`;
    }
    output.explorer.message = addMessageDetail(output.transaction.tx.message.message_hash);
  }

  // TOKEN_CREATE
  if (output.transaction.tx.token) {
    output.transaction.tx.token.symbol = Buffer.from(output.transaction.tx.token.symbol).toString();
    output.transaction.tx.token.name = Buffer.from(output.transaction.tx.token.name).toString();
    output.transaction.tx.token.owner = `Q${Buffer.from(output.transaction.tx.token.owner).toString('hex')}`;
    const addrs = [];
    _.each(output.transaction.tx.token.initial_balances, (bal) => {
      addrs.push({
        address: `Q${Buffer.from(bal.address).toString('hex')}`,
        amount: bal.amount,
      });
      output.transaction.tx.token.initial_balances = addrs;
    });
  }

  output.transaction.addr_from = `Q${Buffer.from(output.transaction.addr_from).toString('hex')}`;

  if (confirmed) {
    output.explorer.confirmed = true;
    output.transaction.header.hash_header = Buffer.from(output.transaction.header.hash_header).toString('hex');
    output.transaction.header.hash_header_prev = Buffer.from(output.transaction.header.hash_header_prev).toString('hex');
    output.transaction.header.merkle_root = Buffer.from(output.transaction.header.merkle_root).toString('hex');
    return output;
  }
  // unconfirmed
  output.explorer.confirmed = false;
  return output;
}

const txParsersConfirmed = {
  coinbase: parseCoinbaseTx,
  token: parseTokenTx,
  transfer_token: parseTransferTokenTx,
  transfer: parseTransferTx,
  slave: parseSlaveTx,
  latticePK: parseLatticePkTx,
  message: parseMessageTx,
  multi_sig_create: parseMultiSigCreateTx,
  multi_sig_spend: parseMultiSigSpendTx,
  multi_sig_vote: parseMultiSigVoteTx,
};

const txParsersUnconfirmed = {
  token: parseTokenTx,
  transfer_token: parseTransferTokenTx,
  transfer: parseTransferTx,
  slave: parseSlaveTx,
  latticePK: parseLatticePkTx,
  message: parseMessageTx,
  multi_sig_create: parseMultiSigCreateTx,
  multi_sig_spend: parseMultiSigSpendTx,
  multi_sig_vote: parseMultiSigVoteTx,
};

module.exports = {
  /**
   * function
   * version: reports current version
   */
  version: function () {
    return '2.2.0';
  },
  tx: function (response) {
    if (typeof response !== 'object') {
      return false;
    }
    const output = JSON.parse(JSON.stringify(response));
    if (response.transaction.header === null) {
      // unconfirmed
      return apiv2Tx(output, false);
    }
    // confirmed
    return apiv2Tx(output, true);
  },
  a: function (response) {
    if (typeof response !== 'object') {
      return false;
    }
    const output = JSON.parse(JSON.stringify(response));
    return apiv2A(output);
  },
  block: function (response) {
    if (typeof response !== 'object') {
      return false;
    }
    const output = JSON.parse(JSON.stringify(response));
    return apiv2Block(output);
  },
  /**
   * function
   * txhash: take a Grpc node response to a txhash query and format it for browsers
   * @response {Object}
   */
  txhash: function (response) {
    if (typeof response !== 'object') {
      return false;
    }
    try {
      const output = JSON.parse(JSON.stringify(response)); // Best way to deep copy in JS

      output.transaction.tx.transaction_hash = Buffer.from(output.transaction.tx.transaction_hash).toString('hex');

      if (response.transaction.header !== null) {
        // If we are in here, it's a confirmed transaction.
        output.transaction.header.hash_header = Buffer.from(output.transaction.header.hash_header).toString('hex');
        output.transaction.header.hash_header_prev = Buffer.from(output.transaction.header.hash_header_prev).toString('hex');
        output.transaction.header.merkle_root = Buffer.from(output.transaction.header.merkle_root).toString('hex');

        output.transaction.tx.amount = '';

        // could be a coinbase here. Why? Because a coinbase tx is never an unconfirmed transaction.
        return txParsersConfirmed[output.transaction.tx.transactionType](output);
      }

      return txParsersUnconfirmed[output.transaction.tx.transactionType](output);
    } catch (error) {
      // error thrown, most likely due to unknown transaction type, so return object unchanged
      return response;
    }
  },
  /**
   * ASYNC function
   * qrlPrice: returns current market price per Quanta in USD from Bittrex API
   */
  qrlPrice: async function () {
    const x = await getQRLprice();
    return x[0].result[0].Last * x[1].result[0].Last;
  },
  b32Decode: b32Decode,
  b32Encode: b32Encode,
  hexAddressToB32Address: hexAddressToB32Address,
  hexAddressToRawAddress: hexAddressToRawAddress,
  b32AddressToRawAddress: b32AddressToRawAddress,
  b32AddressToHexAddress: b32AddressToHexAddress,
  rawAddressToB32Address: rawAddressToB32Address,
  rawAddressToHexAddress: rawAddressToHexAddress,
  compareB32HexAddresses: compareB32HexAddresses,
  parseTokenAndTransferTokenTx: parseTokenAndTransferTokenTx,
};
