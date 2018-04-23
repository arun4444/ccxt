"use strict"

const EXCHANGE = require('./exchange.js')
const CCXT = require('../../ccxt.js')

class Bittrex extends EXCHANGE {
    constructor(key, secret, pass, tradeFees) {
        let cxt = new CCXT.bittrex({
            'apiKey': key,
            'secret': secret,
            enableRateLimit: true
        })
        super(cxt, key, secret, pass)        
        this.id = 'bittrex'
        this.tradeFees = tradeFees
        return this._initialize()
    }
}

module.exports = Bittrex