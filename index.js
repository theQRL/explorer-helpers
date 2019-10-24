var _ = require('underscore')
var math = require('mathjs')
var HTTPS = require('axios')
var bech32 = require('bech32')
var sha256 = require('sha256')
var SHOR_PER_QUANTA = 1000000000

function numberToString (num) {
  return math.format(num, { notation: 'fixed', 'lowerExp': 1e-100, 'upperExp': Infinity })
}

function hexToString (input) {
  var hex = input.toString()
  var str = ''
  for (var n = 0; n < hex.length; n += 2) {
    str += String.fromCharCode(parseInt(hex.substr(n, 2), 16))
  }
  return str
}

// Convert hex to bytes --> unused
// function hexToBytes (hex) {
//   return Buffer.from(hex, 'hex')
// }

function isCoinbaseAddress (descriptorAndHash) {
  function zeroTest (element) {
    return element === 0
  }
  return descriptorAndHash.every(zeroTest)
}

const apiCall = async (apiUrl) => {
  try {
    const response = await HTTPS.get(apiUrl)
    return response.data
  } catch (error) {
    console.log(error)
  }
}

function b32Encode (input) {
  return bech32.encode('q', bech32.toWords(input))
}

function b32Decode (input) {
  const a = bech32.decode(input)
  if (a.prefix !== 'q') {
    throw 'This is not a QRL address'
  }
  return Uint8Array.from(bech32.fromWords(a.words))
}

// Hexstring Address to BECH32 Address
function hexAddressToB32Address (hexAddress) {
  const bin = Buffer.from(hexAddress.substring(1), 'hex')
  const descriptorAndHash = bin.slice(0, 35)
  return b32Encode(descriptorAndHash)
}

function b32AddressToRawAddress (b32Address) {
  const descriptorAndHash = Buffer.from(b32Decode(b32Address))

  // The Raw Coinbase Address is special, and does not need the 4 byte checksum at the end.
  if (isCoinbaseAddress(descriptorAndHash)) {
    return descriptorAndHash
  }
  const ck = sha256(descriptorAndHash, { asBytes: true })
  const ckSlice = Buffer.from(ck.slice(28, 32))
  const answer = Buffer.concat([descriptorAndHash, ckSlice])
  return answer
}

function hexAddressToRawAddress (hexAddress) {
  return Buffer.from(hexAddress.substring(1), 'hex')
}

function b32AddressToHexAddress (b32Address) {
  const rawAddress = b32AddressToRawAddress(b32Address)
  return `Q${Buffer.from(rawAddress).toString('hex')}`
}

// Raw Address to BECH32 Address
function rawAddressToB32Address (rawAddress) {
  rawAddress = Buffer.from(rawAddress) // Sometimes it can just be a JS object, e.g. from a JSON test input
  const descriptorAndHash = rawAddress.slice(0, 35)
  return b32Encode(descriptorAndHash)
}

function rawAddressToHexAddress (rawAddress) {
  return `Q${Buffer.from(rawAddress).toString('hex')}`
}

function compareB32HexAddresses (b32Address, hexAddress) {
  const b32Raw = b32AddressToRawAddress(b32Address)
  const hexRaw = hexAddressToRawAddress(hexAddress)
  return b32Raw.equals(hexRaw) // JS/Buffer oddity: === actually compares if they point to the same object, not if the objects have the same content
}

function parseTokenTx (input) {
  const output = input
  output.transaction.tx.token.initial_balances.forEach((value) => {
    const edit = value
    // eslint-disable-next-line
    edit.amount = numberToString(edit.amount / Math.pow(10, output.transaction.tx.token.decimals))
  })

  const balancesForExplorer = []
  output.transaction.tx.token.initial_balances.forEach((value) => {
    const o = {
      'address_hex': rawAddressToHexAddress(value.address),
      'address_b32': rawAddressToB32Address(value.address),
      'amount': value.amount
    }
    balancesForExplorer.push(o)
  })

  output.transaction.tx.addr_from = output.transaction.addr_from
  output.transaction.tx.public_key = Buffer.from(output.transaction.tx.public_key).toString('hex')
  output.transaction.tx.signature = Buffer.from(output.transaction.tx.signature).toString('hex')
  // eslint-disable-next-line
  output.transaction.tx.token.symbol = Buffer.from(output.transaction.tx.token.symbol).toString()
  output.transaction.tx.token.name = Buffer.from(output.transaction.tx.token.name).toString()
  // output.transaction.tx.token.owner = output.transaction.tx.token.owner <-- REDUNDANT

  output.transaction.tx.fee = numberToString(output.transaction.tx.fee / SHOR_PER_QUANTA)
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
    type: 'CREATE TOKEN'
  }
  return output
}

function parseTransferTokenTx (output) {
  // Calculate total transferred, and generate a clean structure to display outputs from
  let thisTotalTransferred = 0
  const thisOutputs = []
  _.each(output.transaction.tx.transfer_token.addrs_to, (thisAddress, index) => {
    const thisOutput = {
      // eslint-disable-next-line
      amount: '',
    }
    thisOutputs.push(thisOutput)
    // Now update total transferred with the corresponding amount from this output
    // eslint-disable-next-line
    thisTotalTransferred += parseInt(output.transaction.tx.transfer_token.amounts[index], 10)
  })

  const outputsForExplorer = []
  _.each(output.transaction.tx.transfer_token.addrs_to, (thisAddress, index) => {
    const o = {
      address_hex: rawAddressToHexAddress(thisAddress),
      address_b32: rawAddressToB32Address(thisAddress),
      // eslint-disable-next-line
      amount: '',
    }
    outputsForExplorer.push(o)
  })

  output.transaction.tx.fee = numberToString(output.transaction.tx.fee / SHOR_PER_QUANTA)
  output.transaction.tx.addr_from = output.transaction.addr_from
  output.transaction.tx.public_key = Buffer.from(output.transaction.tx.public_key).toString('hex')
  output.transaction.tx.signature = Buffer.from(output.transaction.tx.signature).toString('hex')
  output.transaction.tx.transfer_token.token_txhash = Buffer.from(output.transaction.tx.transfer_token.token_txhash).toString('hex')
  output.transaction.tx.transfer_token.outputs = thisOutputs
  // eslint-disable-next-line
  output.transaction.tx.totalTransferred = ''

  output.transaction.explorer = {
    from_hex: rawAddressToHexAddress(output.transaction.tx.addr_from),
    from_b32: rawAddressToB32Address(output.transaction.tx.addr_from),
    outputs: outputsForExplorer,
    signature: output.transaction.tx.signature,
    publicKey: output.transaction.tx.public_key,
    token_txhash: output.transaction.tx.transfer_token.token_txhash,
    // eslint-disable-next-line
    totalTransferred: '',
    type: 'TRANSFER TOKEN'
  }
  return output
}

function parseTokenAndTransferTokenTx (responseTokenTx, responseTransferTokenTx) {
  // Transform Block Metadata into human readable form, just like in txhash()
  // Use TransferToken's Block Metadata, not TokenTx's
  const output = JSON.parse(JSON.stringify(responseTransferTokenTx)) // Best way to deep copy in JS

  output.transaction.tx.transaction_hash = Buffer.from(output.transaction.tx.transaction_hash).toString('hex')
  if (output.transaction.header !== null) { // If we are in here, it's a confirmed transaction.
    output.transaction.header.hash_header = Buffer.from(output.transaction.header.hash_header).toString('hex')
    output.transaction.header.hash_header_prev = Buffer.from(output.transaction.header.hash_header_prev).toString('hex')
    output.transaction.header.merkle_root = Buffer.from(output.transaction.header.merkle_root).toString('hex')
    output.transaction.tx.amount = ''
  }

  // Get relevant information from TokenTx
  const thisSymbol = Buffer.from(responseTokenTx.transaction.tx.token.symbol).toString()
  const thisName = Buffer.from(responseTokenTx.transaction.tx.token.name).toString()
  const thisDecimals = responseTokenTx.transaction.tx.token.decimals

  // Calculate total transferred, and generate a clean structure to display outputs from
  let thisTotalTransferred = 0
  const thisOutputs = []
  _.each(output.transaction.tx.transfer_token.addrs_to, (thisAddress, index) => {
    const thisOutput = {
      address: thisAddress,
      // eslint-disable-next-line
      amount: numberToString(output.transaction.tx.transfer_token.amounts[index] / Math.pow(10, thisDecimals)),
    }
    thisOutputs.push(thisOutput)
    // Now update total transferred with the corresponding amount from this output
    // eslint-disable-next-line
    thisTotalTransferred += parseInt(output.transaction.tx.transfer_token.amounts[index], 10)
  })

  const outputsForExplorer = []
  _.each(output.transaction.tx.transfer_token.addrs_to, (thisAddress, index) => {
    const o = {
      address_hex: rawAddressToHexAddress(thisAddress),
      address_b32: rawAddressToB32Address(thisAddress),
      // eslint-disable-next-line
      amount: numberToString(output.transaction.tx.transfer_token.amounts[index] / Math.pow(10, thisDecimals)),

    }
    outputsForExplorer.push(o)
  })
  output.transaction.tx.fee = numberToString(output.transaction.tx.fee / SHOR_PER_QUANTA)
  output.transaction.tx.addr_from = output.transaction.addr_from
  output.transaction.tx.public_key = Buffer.from(output.transaction.tx.public_key).toString('hex')
  output.transaction.tx.signature = Buffer.from(output.transaction.tx.signature).toString('hex')
  output.transaction.tx.transfer_token.token_txhash = Buffer.from(output.transaction.tx.transfer_token.token_txhash).toString('hex')
  output.transaction.tx.transfer_token.outputs = thisOutputs
  // eslint-disable-next-line
  output.transaction.tx.totalTransferred = numberToString(thisTotalTransferred / Math.pow(10, thisDecimals))

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
    type: 'TRANSFER TOKEN'
  }
  return output
}

function parseTransferTx (output) {
  // Calculate total transferred, and generate a clean structure to display outputs from
  let thisTotalTransferred = 0
  const thisOutputs = []
  _.each(output.transaction.tx.transfer.addrs_to, (thisAddress, index) => {
    const thisOutput = {
      address: thisAddress,
      amount: numberToString(output.transaction.tx.transfer.amounts[index] / SHOR_PER_QUANTA)
    }
    thisOutputs.push(thisOutput)
    // Now update total transferred with the corresponding amount from this output
    thisTotalTransferred += parseInt(output.transaction.tx.transfer.amounts[index], 10)
  })

  const outputsForExplorer = []
  _.each(output.transaction.tx.transfer.addrs_to, (thisAddress, index) => {
    const thisOutput = {
      address_hex: rawAddressToHexAddress(thisAddress),
      address_b32: rawAddressToB32Address(thisAddress),
      amount: numberToString(output.transaction.tx.transfer.amounts[index] / SHOR_PER_QUANTA)
    }
    outputsForExplorer.push(thisOutput)
  })

  output.transaction.tx.addr_from = output.transaction.addr_from
  output.transaction.tx.transfer.outputs = thisOutputs
  output.transaction.tx.amount = numberToString(thisTotalTransferred / SHOR_PER_QUANTA)
  output.transaction.tx.fee = numberToString(output.transaction.tx.fee / SHOR_PER_QUANTA)
  output.transaction.tx.public_key = Buffer.from(output.transaction.tx.public_key).toString('hex')
  output.transaction.tx.signature = Buffer.from(output.transaction.tx.signature).toString('hex')
  output.transaction.explorer = {
    from_hex: rawAddressToHexAddress(output.transaction.tx.addr_from),
    from_b32: rawAddressToB32Address(output.transaction.tx.addr_from),
    outputs: outputsForExplorer,
    totalTransferred: numberToString(thisTotalTransferred / SHOR_PER_QUANTA),
    type: 'TRANSFER'
  }
  return output
}

function parseSlaveTx (output) {
  output.transaction.tx.fee = numberToString(output.transaction.tx.fee / SHOR_PER_QUANTA)

  output.transaction.tx.public_key = Buffer.from(output.transaction.tx.public_key).toString('hex')
  output.transaction.tx.signature = Buffer.from(output.transaction.tx.signature).toString('hex')
  output.transaction.tx.addr_from = output.transaction.addr_from
  output.transaction.tx.slave.slave_pks.forEach((value, index) => {
    output.transaction.tx.slave.slave_pks[index] =
      Buffer.from(value).toString('hex')
  })

  output.transaction.explorer = {
    from_hex: rawAddressToHexAddress(output.transaction.tx.addr_from),
    from_b32: rawAddressToB32Address(output.transaction.tx.addr_from),
    to_hex: '',
    to_b32: '',
    signature: output.transaction.tx.signature,
    publicKey: output.transaction.tx.public_key,
    amount: output.transaction.tx.amount,
    type: 'SLAVE'
  }
  return output
}

function parseLatticePkTx (output) {
  output.transaction.tx.fee = numberToString(output.transaction.tx.fee / SHOR_PER_QUANTA)
  output.transaction.tx.public_key = Buffer.from(output.transaction.tx.public_key).toString('hex')
  output.transaction.tx.signature = Buffer.from(output.transaction.tx.signature).toString('hex')
  output.transaction.tx.addr_from = output.transaction.addr_from
  output.transaction.tx.latticePK.kyber_pk = Buffer.from(output.transaction.tx.latticePK.kyber_pk).toString('hex')
  output.transaction.tx.latticePK.dilithium_pk = Buffer.from(output.transaction.tx.latticePK.dilithium_pk).toString('hex')

  output.transaction.explorer = {
    from_hex: rawAddressToHexAddress(output.transaction.tx.addr_from),
    from_b32: rawAddressToB32Address(output.transaction.tx.addr_from),
    to_hex: '',
    to_b32: '',
    signature: output.transaction.tx.signature,
    publicKey: output.transaction.tx.public_key,
    amount: output.transaction.tx.amount,
    type: 'LATTICE PK'
  }
  return output
}

function parseMultiSigCreateTx(output) {
  try {
    output.transaction.tx.fee = numberToString(output.transaction.tx.fee / SHOR_PER_QUANTA)
    output.transaction.tx.public_key = Buffer.from(output.transaction.tx.public_key).toString('hex')
    output.transaction.tx.signature = Buffer.from(output.transaction.tx.signature).toString('hex')

    output.transaction.tx.master_addr = Buffer.from(output.transaction.tx.master_addr).toString('hex')
    output.transaction.explorer = {
      from_hex: rawAddressToHexAddress(output.transaction.addr_from),
      from_b32: rawAddressToB32Address(output.transaction.addr_from),
      signature: output.transaction.tx.signature,
      publicKey: output.transaction.tx.public_key,
      type: 'MULTISIG_CREATE'
    }

    output.transaction.addr_from = Buffer.from(output.transaction.addr_from).toString('hex')
    // output.transaction.tx.addr_from = Buffer.from(output.transaction.tx.addr_from).toString('hex')
    output.transaction.tx.master_addr = Buffer.from(output.transaction.tx.master_addr).toString('hex')
    
    formattedSignatories = []
    _.each(output.transaction.tx.multi_sig_create.signatories, (thisAddress) => {
      formattedSignatories.push(Buffer.from(thisAddress).toString('hex'))
    })
    output.transaction.tx.multi_sig_create.signatories = formattedSignatories
  } catch (error) {
    // catch to ensure output is returned
    console.log(error)
  }
  return output
}

function parseMessageTx (input) {
  const output = input
  output.transaction.tx.fee = numberToString(output.transaction.tx.fee / SHOR_PER_QUANTA)
  output.transaction.tx.addr_from = output.transaction.addr_from
  output.transaction.tx.public_key = Buffer.from(output.transaction.tx.public_key).toString('hex')
  output.transaction.tx.signature = Buffer.from(output.transaction.tx.signature).toString('hex')

  // Check if message_hash is encoded message
  const hexMessage = Buffer.from(output.transaction.tx.message.message_hash).toString('hex')
  if (hexMessage.substring(0, 4) === 'afaf') {
    // Found encoded message
    const messageType = hexMessage.substring(4, 5)

    // Document Notarisation
    if (messageType === 'a') {
      const hashType = hexMessage.substring(5, 6)

      // Define place for hash and text to live
      let thisHash
      let thisText
      let thisHashFunction

      // SHA1
      if (hashType === '1') {
        thisHash = hexMessage.substring(6, 46)
        thisText = hexToString(hexMessage.substring(46))
        thisHashFunction = 'SHA1'
        // SHA256
      } else if (hashType === '2') {
        thisHash = hexMessage.substring(6, 70)
        thisText = hexToString(hexMessage.substring(70))
        thisHashFunction = 'SHA256'
        // MD5
      } else if (hashType === '3') {
        thisHash = hexMessage.substring(6, 38)
        thisText = hexToString(hexMessage.substring(38))
        thisHashFunction = 'MD5'
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
        type: 'DOCUMENT_NOTARISATION'
      }
      return output
    }
  }
  if (hexMessage.substring(0, 8) === '0f0f0002') {
    const x = Buffer.from(output.transaction.tx.message.message_hash, 'hex')
    let kbType = 'error'
    if (hexMessage.substring(8, 10) === 'af') { kbType = 'remove' }
    if (hexMessage.substring(8, 10) === 'aa') { kbType = 'add' }
    let kbUser = ''
    let spaceIndex = 0
    for (let i = 12; i < hexMessage.length; i = i + 2) {
      if (hexMessage.substring(i, i + 2) === '20' && spaceIndex === 0) { spaceIndex = i }
    }

    kbUser = hexToString(hexMessage.substring(12, spaceIndex))
    let kbHex = x.slice(spaceIndex, x.length)
    kbHex = kbHex.toString('hex')

    // Found encoded message

    output.transaction.tx.message.message_hash = Buffer.from(output.transaction.tx.message.message_hash).toString()
    output.transaction.explorer = {
      from_hex: rawAddressToHexAddress(output.transaction.tx.addr_from),
      from_b32: rawAddressToB32Address(output.transaction.tx.addr_from),
      signature: output.transaction.tx.signature,
      publicKey: output.transaction.tx.public_key,
      message: output.transaction.tx.message.message_hash,
      keybaseUser: kbUser,
      keybaseType: kbType,
      keybaseHex: kbHex,
      type: 'KEYBASE'
    }
    return output
  }

  output.transaction.tx.message.message_hash = Buffer.from(output.transaction.tx.message.message_hash).toString()
  output.transaction.explorer = {
    from_hex: rawAddressToHexAddress(output.transaction.tx.addr_from),
    from_b32: rawAddressToB32Address(output.transaction.tx.addr_from),
    signature: output.transaction.tx.signature,
    publicKey: output.transaction.tx.public_key,
    message: output.transaction.tx.message.message_hash,
    type: 'MESSAGE'
  }
  return output
}

function parseCoinbaseTx (output) {
  output.transaction.tx.addr_from = output.transaction.addr_from
  output.transaction.tx.addr_to = output.transaction.tx.coinbase.addr_to
  // output.transaction.tx.coinbase.addr_to = output.transaction.tx.coinbase.addr_to <--- REDUNDANT
  // eslint-disable-next-line
  output.transaction.tx.amount = numberToString(output.transaction.tx.coinbase.amount / SHOR_PER_QUANTA)

  output.transaction.explorer = {
    from_hex: '',
    from_b32: '',
    to_hex: rawAddressToHexAddress(output.transaction.tx.addr_to),
    to_b32: rawAddressToB32Address(output.transaction.tx.addr_to),
    type: 'COINBASE'
  }
  return output
}

async function getQRLprice () {
  try {
    const apiUrl = 'https://bittrex.com/api/v1.1/public/getmarketsummary?market=btc-qrl'
    const apiUrlUSD = 'https://bittrex.com/api/v1.1/public/getmarketsummary?market=usdt-btc'
    let b = await apiCall(apiUrl)
    let c = await apiCall(apiUrlUSD)
    return ([b, c])
  } catch (e) {
    console.log(e.message)
  }
}

const txParsersConfirmed = {
  'coinbase': parseCoinbaseTx,
  'token': parseTokenTx,
  'transfer_token': parseTransferTokenTx,
  'transfer': parseTransferTx,
  'slave': parseSlaveTx,
  'latticePK': parseLatticePkTx,
  'message': parseMessageTx,
  'multi_sig_create': parseMultiSigCreateTx,
}

const txParsersUnconfirmed = {
  'token': parseTokenTx,
  'transfer_token': parseTransferTokenTx,
  'transfer': parseTransferTx,
  'slave': parseSlaveTx,
  'latticePK': parseLatticePkTx,
  'message': parseMessageTx,
  'multi_sig_create': parseMultiSigCreateTx,
}

module.exports = {
  /**
   * function
   * version: reports current version
   */
  version: function () {
    return '0.2.0'
  },
  /**
   * function
   * txhash: take a Grpc node response to a txhash query and format it for browsers
   * @response {Object}
   */
  txhash: function (response) {
    if ((typeof response) !== 'object') { return false }
    const output = JSON.parse(JSON.stringify(response)) // Best way to deep copy in JS

    output.transaction.tx.transaction_hash = Buffer.from(output.transaction.tx.transaction_hash).toString('hex')

    if (response.transaction.header !== null) { // If we are in here, it's a confirmed transaction.
      output.transaction.header.hash_header = Buffer.from(output.transaction.header.hash_header).toString('hex')
      output.transaction.header.hash_header_prev = Buffer.from(output.transaction.header.hash_header_prev).toString('hex')
      output.transaction.header.merkle_root = Buffer.from(output.transaction.header.merkle_root).toString('hex')

      output.transaction.tx.amount = ''

      // could be a coinbase here. Why? Because a coinbase tx is never an unconfirmed transaction.
      return txParsersConfirmed[output.transaction.tx.transactionType](output)
    }

    return txParsersUnconfirmed[output.transaction.tx.transactionType](output)
  },
  /**
   * ASYNC function
   * qrlPrice: returns current market price per Quanta in USD from Bittrex API
   */
  qrlPrice: async function () {
    const x = await getQRLprice()
    return x[0].result[0].Last * x[1].result[0].Last
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
  parseTokenAndTransferTokenTx: parseTokenAndTransferTokenTx
}
