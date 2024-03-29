# explorer-helpers

![Build Status](https://github.com/theqrl/explorer-helpers/actions/workflows/build-and-test.yml/badge.svg?branch=main) [![npm version](https://badge.fury.io/js/%40theqrl%2Fexplorer-helpers.svg)](https://badge.fury.io/js/%40theqrl%2Fexplorer-helpers)

A helper library for front end interfaces to the QRL

v2 API functions are documented below. Legacy API calls to this module remain functional.

## Installation

  `npm install @theqrl/explorer-helpers`

## Usage

`var explorerHelpers = require("@theqrl/explorer-helpers")`

(or `import` equivalent in Meteor)

### qrlPrice() => price _number_

Queries Bittrex market price of $QRL.

|   | Description |
| --- | --- |
| Function type | async 						 |
| Parameters    | _none_ 						 |
| Returns       | _number_ price: price per $QRL in USD |

```javascript
var x = await explorerHelpers.qrlPrice()
console.log(`1 QRL = $${x}`)
```
[RunKit example](https://runkit.com/jplomas/5ae04b2b291cdd0011f7a1a6)

### tx(response _json_) => formatted _json_

Takes a grpc query response and formats it for browser display.

|   | Description |
| --- | --- |
| Function type | sync 						 |
| Parameters    | **response _object_**<br>a response to a grpc query |
| Returns       | **formatted _json_**<br>reformatted json object for browser display or element queries |

```javascript
var x = explorerHelpers.tx(response)
console.log(x)
```

### block(response _json_) => formatted _json_

Takes a grpc query response from GetObject and formats it for browser display where the requested data was a block.

|   | Description |
| --- | --- |
| Function type | sync 						 |
| Parameters    | **response _object_**<br>a response to a grpc query |
| Returns       | **formatted _json_**<br>reformatted json object for browser display or element queries |

```javascript
var x = explorerHelpers.block(response)
console.log(x)
```

### a(response _json_) => formatted _json_ 

Takes a grpc query response from GetObject and formats it for browser display where the requested data was an address.

|   | Description |
| --- | --- |
| Function type | sync 						 |
| Parameters    | **response _object_**<br>a response to a grpc query |
| Returns       | **formatted _json_**<br>reformatted json object for browser display or element queries |

```javascript
var x = explorerHelpers.a(response)
console.log(x)
```

### tokens(response _json_) => formatted _json_ 

Takes a grpc query response from GetTokensByAddress and formats it for browser display.

|   | Description |
| --- | --- |
| Function type | sync                          |
| Parameters    | **response _object_**<br>a response to a grpc query |
| Returns       | **formatted _json_**<br>reformatted json object for browser display or element queries |

```javascript
var x = explorerHelpers.tokens(response)
console.log(x)
```

### multisig(response _json_) => formatted _json_ 

Takes a grpc query response from GetMultiSigAddressesByAddress and formats it for browser display.

|   | Description |
| --- | --- |
| Function type | sync                          |
| Parameters    | **response _object_**<br>a response to a grpc query |
| Returns       | **formatted _json_**<br>reformatted json object for browser display or element queries |

```javascript
var x = explorerHelpers.multisig(response)
console.log(x)
```

## Tests

  `npm test`
