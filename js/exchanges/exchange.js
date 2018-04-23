"use strict"

const db = require('../wrapper/db.js')
const rp = require('request-promise-native')
const timeout = 15000

class Exchange {
    constructor(ccxt, key, secret, pass) {
        this.ccxt = ccxt
        this.key = key
        this.secret = secret
        this.pass = pass
    }

    async _initialize() {
        this.nativeToCanonPairs = new Map()
        this.canonToNativePairs = new Map()

        this.nativeToCanonCoin = new Map()
        this.canonToNativeCoin = new Map()

        const pairs = await db.getPairMapExchange(this.id)
        const coins = await db.getExchangeCanon(this.id)

        for (let i = 0; i < pairs.length; i++) {
            this.nativeToCanonPairs.set(pairs[i].coin_map, pairs[i].symbol)
            this.canonToNativePairs.set(pairs[i].symbol, pairs[i].coin_map)
        }

        for (let i = 0; i < coins.length; i++) {
            this.nativeToCanonCoin.set(coins[i].coin_map, coins[i].symbol)
            this.canonToNativeCoin.set(coins[i].symbol, coins[i].coin_map)
        }

        this.nativeCoinArray = Array.from( this.nativeToCanonCoin.keys() )
        this.canonCoinArray = Array.from( this.canonToNativeCoin.keys() )
        return this
    }
}

module.exports = Exchange