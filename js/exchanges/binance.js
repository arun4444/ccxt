"use strict"

const EXCHANGE = require('./exchange.js')
const CCXT = require('../ccxt/ccxt.js')

class Binance extends EXCHANGE {
    constructor(key, secret, pass, tradeFees) {
        let cxt = new CCXT.binance({
            'apiKey': key,
            'secret': secret,
            enableRateLimit: true
        })
        super(cxt, key, secret, pass)        
        this.id = 'binance'
        this.tradeFees = tradeFees
        return this._initialize()
    }
}

module.exports = Binance