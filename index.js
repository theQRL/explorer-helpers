var _ = require('underscore');
var math = require('mathjs');

var SHOR_PER_QUANTA = 1000000000;

function numberToString(num) {
  return math.format(num, { notation: 'fixed', "lowerExp": 1e-100, "upperExp": Infinity });
}

module.exports = function(response) {
  const output = response
  try {
    if (response.transaction.header) {
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

    if (output.transaction.tx.transactionType === 'transfer_token') {
      // Request Token Decimals / Symbol
      const symbolRequest = {
        query: Buffer.from(output.transaction.tx.transfer_token.token_txhash, 'hex'),
      }
      const thisSymbolResponse = Meteor.wrapAsync(getObject)(symbolRequest)
      /* FIXME: thisSymbol is not used! */
      // eslint-disable-next-line
      const thisSymbol = Buffer.from(thisSymbolResponse.transaction.tx.token.symbol).toString()
      const thisDecimals = thisSymbolResponse.transaction.tx.token.decimals

      // Calculate total transferred, and generate a clean structure to display outputs from
      let thisTotalTransferred = 0
      const thisOutputs = []
      _.each(output.transaction.tx.transfer_token.addrs_to, (thisAddress, index) => {
        const thisOutput = {
          address: `Q${Buffer.from(thisAddress).toString('hex')}`,
          // eslint-disable-next-line
          amount: numberToString(output.transaction.tx.transfer_token.amounts[index] / Math.pow(10, thisDecimals)),
        }
        thisOutputs.push(thisOutput)
        // Now update total transferred with the corresponding amount from this output
        thisTotalTransferred += parseInt(output.transaction.tx.transfer_token.amounts[index], 10)
      })
      output.transaction.tx.fee = numberToString(output.transaction.tx.fee / SHOR_PER_QUANTA)
      output.transaction.tx.addr_from = `Q${Buffer.from(output.transaction.addr_from).toString('hex')}`
      output.transaction.tx.public_key = Buffer.from(output.transaction.tx.public_key).toString('hex')
      output.transaction.tx.signature = Buffer.from(output.transaction.tx.signature).toString('hex')
      output.transaction.tx.transfer_token.token_txhash = Buffer.from(output.transaction.tx.transfer_token.token_txhash).toString('hex')
      output.transaction.tx.transfer_token.outputs = thisOutputs
      // eslint-disable-next-line
      output.transaction.tx.totalTransferred = numberToString(thisTotalTransferred / Math.pow(10, thisDecimals))

      output.transaction.explorer = {
        from: output.transaction.tx.addr_from,
        outputs: thisOutputs,
        signature: output.transaction.tx.signature,
        publicKey: output.transaction.tx.public_key,
        token_txhash: output.transaction.tx.transfer_token.token_txhash,
        // eslint-disable-next-line
        totalTransferred: numberToString(thisTotalTransferred / Math.pow(10, thisDecimals)),
        type: 'TRANSFER TOKEN',
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
    return output
  } catch (e) {
    console.log(e)
    return false
  }
}
