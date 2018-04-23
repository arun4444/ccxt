"use strict"

const EXCHANGE = require('./exchange.js')
const CCXT = require('../../ccxt.js')

class Kucoin extends EXCHANGE {
    constructor(key, secret, pass, tradeFees) {
        let cxt = new CCXT.kucoin({
            'apiKey': key,
            'secret': secret,
            enableRateLimit: true
        })
        super(cxt, key, secret, pass)     
        this.id = 'kucoin'
        this.tradeFees = tradeFees
        return this._initialize()
    }
}

module.exports = Kucoin