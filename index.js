var _ = require('underscore');
var math = require('mathjs');
var HTTPS = require('axios');
var bech32 = require('bech32');
var sha256 = require('sha256');
var SHOR_PER_QUANTA = 1000000000;

function numberToString(num) {
  return math.format(num, { notation: 'fixed', "lowerExp": 1e-100, "upperExp": Infinity });
}

function hexToString(input) {
  var hex = input.toString()
  var str = ''
  for (var n = 0; n < hex.length; n += 2) {
    str += String.fromCharCode(parseInt(hex.substr(n, 2), 16))
  }
  return str
}

// Convert hex to bytes
function hexToBytes(hex) {
  return Buffer.from(hex, 'hex')
}

function isCoinbaseAddress(descriptorAndHash) {
  function zeroTest(element) {
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

function b32Encode(input) {
  return bech32.encode('q', bech32.toWords(input))
}

function b32Decode(input) {
  a = bech32.decode(input)
  if (a.prefix != 'q') {
    throw "This is not a QRL address"
  }
  return Uint8Array.from(bech32.fromWords(a.words))
}

// Hexstring Address to BECH32 Address
function hexAddressToB32Address(hexAddress) {
  bin = Buffer.from(hexAddress.substring(1), 'hex')
  descriptorAndHash = bin.slice(0, 35)
  return b32Encode(descriptorAndHash)
}

function b32AddressToRawAddress(b32Address) {
  descriptorAndHash = Buffer.from(b32Decode(b32Address))

  // The Raw Coinbase Address is special, and does not need the 4 byte checksum at the end.
  if (isCoinbaseAddress(descriptorAndHash)) {
    return descriptorAndHash
  }
  ck = sha256(descriptorAndHash, {asBytes: true})
  ck_slice = Buffer.from(ck.slice(28,32))
  answer = Buffer.concat([descriptorAndHash, ck_slice])
  return answer
}

function hexAddressToRawAddress(hexAddress) {
  return Buffer.from(hexAddress.substring(1), 'hex')
}

function b32AddressToHexAddress(b32Address) {
  rawAddress = b32AddressToRawAddress(b32Address)
  return `Q${Buffer.from(rawAddress).toString('hex')}`
}

// Raw Address to BECH32 Address
function rawAddressToB32Address(rawAddress) {
  descriptorAndHash = rawAddress.slice(0, 35)
  return b32Encode(descriptorAndHash)
}

function rawAddressToHexAddress(rawAddress) {
  return `Q${Buffer.from(rawAddress).toString('hex')}`
}

function compareB32HexAddresses(b32Address, hexAddress) {
  b32_raw = b32AddressToRawAddress(b32Address)
  hex_raw = hexAddressToRawAddress(hexAddress)
  return b32_raw.equals(hex_raw) // JS/Buffer oddity: === actually compares if they point to the same object, not if the objects have the same content
}

async function getQRLprice() {
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

module.exports = {
  /**
   * function
   * version: reports current version
   */
  version: function() {
    return '0.0.6'
  },
  /**
   * function
   * txhash: take a Grpc node response to a txhash query and format it for browsers
   * @response {Object}
   */
  txhash: function(response) {
    const output = response
    if ((typeof response) !== 'object') { return false }

    if (response.transaction.header !== null) {
      output.transaction.header.hash_header = Buffer.from(output.transaction.header.hash_header).toString('hex')
      output.transaction.header.hash_header_prev = Buffer.from(output.transaction.header.hash_header_prev).toString('hex')
      output.transaction.header.merkle_root = Buffer.from(output.transaction.header.merkle_root).toString('hex')

      output.transaction.tx.transaction_hash = Buffer.from(output.transaction.tx.transaction_hash).toString('hex')
      output.transaction.tx.amount = ''

      if (output.transaction.tx.transactionType === 'coinbase') {
        output.transaction.tx.addr_from = `Q${Buffer.from(output.transaction.addr_from).toString('hex')}`
        output.transaction.tx.addr_to = `Q${Buffer.from(output.transaction.tx.coinbase.addr_to).toString('hex')}`
        output.transaction.tx.coinbase.addr_to = `Q${Buffer.from(output.transaction.tx.coinbase.addr_to).toString('hex')}`
        // eslint-disable-next-line
        output.transaction.tx.amount = numberToString(output.transaction.tx.coinbase.amount / SHOR_PER_QUANTA)

        output.transaction.explorer = {
          from: '',
          to: output.transaction.tx.addr_to,
          type: 'COINBASE',
        }
      }
    } else {
      output.transaction.tx.transaction_hash = Buffer.from(output.transaction.tx.transaction_hash).toString('hex')
    }

    if (output.transaction.tx.transactionType === 'token') {
      const balances = []
      output.transaction.tx.token.initial_balances.forEach((value) => {
        const edit = value
        edit.address = `Q${Buffer.from(edit.address).toString('hex')}`
        // eslint-disable-next-line
        edit.amount = numberToString(edit.amount / Math.pow(10, output.transaction.tx.token.decimals))
        balances.push(edit)
      })

      output.transaction.tx.addr_from = `Q${Buffer.from(output.transaction.addr_from).toString('hex')}`
      output.transaction.tx.public_key = Buffer.from(output.transaction.tx.public_key).toString('hex')
      output.transaction.tx.signature = Buffer.from(output.transaction.tx.signature).toString('hex')
      // eslint-disable-next-line
      output.transaction.tx.token.symbol = Buffer.from(output.transaction.tx.token.symbol).toString()
      output.transaction.tx.token.name = Buffer.from(output.transaction.tx.token.name).toString()
      output.transaction.tx.token.owner = `Q${Buffer.from(output.transaction.tx.token.owner).toString('hex')}`

      output.transaction.tx.fee = numberToString(output.transaction.tx.fee / SHOR_PER_QUANTA)
      output.transaction.explorer = {
        from: output.transaction.tx.addr_from,
        to: output.transaction.tx.addr_from,
        signature: output.transaction.tx.signature,
        publicKey: output.transaction.tx.public_key,
        symbol: output.transaction.tx.token.symbol,
        name: output.transaction.tx.token.name,
        decimals: output.transaction.tx.token.decimals,
        owner: output.transaction.tx.token.owner,
        initialBalances: balances,
        type: 'CREATE TOKEN',
      }
    }

    if (output.transaction.tx.transactionType === 'transfer') {
      // Calculate total transferred, and generate a clean structure to display outputs from
      let thisTotalTransferred = 0
      const thisOutputs = []
      _.each(output.transaction.tx.transfer.addrs_to, (thisAddress, index) => {
        const thisOutput = {
          address: `Q${Buffer.from(thisAddress).toString('hex')}`,
          amount: numberToString(output.transaction.tx.transfer.amounts[index] / SHOR_PER_QUANTA),
        }
        thisOutputs.push(thisOutput)
        // Now update total transferred with the corresponding amount from this output
        thisTotalTransferred += parseInt(output.transaction.tx.transfer.amounts[index], 10)
      })
      output.transaction.tx.addr_from = `Q${Buffer.from(output.transaction.addr_from).toString('hex')}`
      output.transaction.tx.transfer.outputs = thisOutputs
      output.transaction.tx.amount = numberToString(thisTotalTransferred / SHOR_PER_QUANTA)
      output.transaction.tx.fee = numberToString(output.transaction.tx.fee / SHOR_PER_QUANTA)
      output.transaction.tx.public_key = Buffer.from(output.transaction.tx.public_key).toString('hex')
      output.transaction.tx.signature = Buffer.from(output.transaction.tx.signature).toString('hex')
      output.transaction.explorer = {
        from: output.transaction.tx.addr_from,
        outputs: thisOutputs,
        totalTransferred: numberToString(thisTotalTransferred / SHOR_PER_QUANTA),
        type: 'TRANSFER',
      }
    }

    if (output.transaction.tx.transactionType === 'slave') {
      output.transaction.tx.fee = numberToString(output.transaction.tx.fee / SHOR_PER_QUANTA)

      output.transaction.tx.public_key = Buffer.from(output.transaction.tx.public_key).toString('hex')
      output.transaction.tx.signature = Buffer.from(output.transaction.tx.signature).toString('hex')
      output.transaction.tx.addr_from = `Q${Buffer.from(output.transaction.addr_from).toString('hex')}`
      output.transaction.tx.slave.slave_pks.forEach((value, index) => {
        output.transaction.tx.slave.slave_pks[index] =
          Buffer.from(value).toString('hex')
      })

      output.transaction.explorer = {
        from: output.transaction.tx.addr_from,
        to: '',
        signature: output.transaction.tx.signature,
        publicKey: output.transaction.tx.public_key,
        amount: output.transaction.tx.amount,
        type: 'SLAVE',
      }
    }

    if (output.transaction.tx.transactionType === 'latticePK') {
      output.transaction.tx.fee = numberToString(output.transaction.tx.fee / SHOR_PER_QUANTA)
      output.transaction.tx.public_key = Buffer.from(output.transaction.tx.public_key).toString('hex')
      output.transaction.tx.signature = Buffer.from(output.transaction.tx.signature).toString('hex')
      output.transaction.tx.addr_from = `Q${Buffer.from(output.transaction.addr_from).toString('hex')}`
      output.transaction.tx.latticePK.kyber_pk = Buffer.from(output.transaction.tx.latticePK.kyber_pk).toString('hex')
      output.transaction.tx.latticePK.dilithium_pk = Buffer.from(output.transaction.tx.latticePK.dilithium_pk).toString('hex')

      output.transaction.explorer = {
        from: output.transaction.tx.addr_from,
        to: '',
        signature: output.transaction.tx.signature,
        publicKey: output.transaction.tx.public_key,
        amount: output.transaction.tx.amount,
        type: 'LATTICE PK',
      }
    }

    if (output.transaction.tx.transactionType === 'message') {
      output.transaction.tx.fee = numberToString(output.transaction.tx.fee / SHOR_PER_QUANTA)
      output.transaction.tx.addr_from = `Q${Buffer.from(output.transaction.addr_from).toString('hex')}`
      output.transaction.tx.public_key = Buffer.from(output.transaction.tx.public_key).toString('hex')
      output.transaction.tx.signature = Buffer.from(output.transaction.tx.signature).toString('hex')

      // Check if message_hash is encoded message
      const hexMessage = Buffer.from(output.transaction.tx.message.message_hash).toString('hex')

      if (hexMessage.substring(0,4) == 'afaf') {
        // Found encoded message
        const messageType = hexMessage.substring(4,5)

        // Document Notarisation
        if (messageType == 'a') {
          const hashType = hexMessage.substring(5,6)

          // Define place for hash and text to live
          let thisHash
          let thisText
          let thisHashFunction

          // SHA1
          if (hashType == '1') {
            thisHash = hexMessage.substring(6,46)
            thisText = hexToString(hexMessage.substring(46))
            thisHashFunction = 'SHA1'
          // SHA256
          } else if (hashType == '2') {
            thisHash = hexMessage.substring(6,70)
            thisText = hexToString(hexMessage.substring(70))
            thisHashFunction = 'SHA256'
          // MD5
          } else if (hashType == '3') {
            thisHash = hexMessage.substring(6,38)
            thisText = hexToString(hexMessage.substring(38))
            thisHashFunction = 'MD5'
          }

          // Save output as DOCUMENT_NOTARISAION txn type
          output.transaction.explorer = {
            from: output.transaction.tx.addr_from,
            signature: output.transaction.tx.signature,
            publicKey: output.transaction.tx.public_key,
            hash: thisHash,
            hash_function: thisHashFunction,
            text: thisText,
            raw: hexMessage,
            type: 'DOCUMENT_NOTARISATION',
          }
        // Unknown encoded message - show as normal message
        } else {
          output.transaction.tx.message.message_hash = Buffer.from(output.transaction.tx.message.message_hash).toString()
          output.transaction.explorer = {
            from: output.transaction.tx.addr_from,
            signature: output.transaction.tx.signature,
            publicKey: output.transaction.tx.public_key,
            message: output.transaction.tx.message.message_hash,
            type: 'MESSAGE',
          }
        }
      // Non encoded message txn
      } else {
        output.transaction.tx.message.message_hash = Buffer.from(output.transaction.tx.message.message_hash).toString()
        output.transaction.explorer = {
          from: output.transaction.tx.addr_from,
          signature: output.transaction.tx.signature,
          publicKey: output.transaction.tx.public_key,
          message: output.transaction.tx.message.message_hash,
          type: 'MESSAGE',
        }
      }
    }
    
    return output
  },
  /**
   * ASYNC function
   * qrlPrice: returns current market price per Quanta in USD from Bittrex API
   */
  qrlPrice: async function() {
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
  compareB32HexAddresses: compareB32HexAddresses
}