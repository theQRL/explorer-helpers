# explorer-helpers

[![Build Status](https://travis-ci.org/theQRL/explorer-helpers.svg?branch=master)](https://travis-ci.org/theQRL/explorer-helpers) [![Coverage Status](https://coveralls.io/repos/github/theQRL/explorer-helpers/badge.svg?branch=master)](https://coveralls.io/github/theQRL/explorer-helpers?branch=master) [![npm version](https://badge.fury.io/js/%40theqrl%2Fexplorer-helpers.svg)](https://badge.fury.io/js/%40theqrl%2Fexplorer-helpers)

A helper library for front end interfaces to the QRL

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

### txhash(response _json_) => formatted _json_

Takes a grpc query response and formats it for browser display.

|   | Description |
| --- | --- |
| Function type | sync 						 |
| Parameters    | **response _object_**<br>a response to a grpc query |
| Returns       | **formatted _json_**<br>reformatted json object for browser display or element queries |

```javascript
var x = explorerHelpers.txhash(response)
console.log(x)
```

## Tests

  `npm test`
