"use strict"

const EXCHANGE = require('./exchange.js')
const CCXT = require('../../ccxt.js')

class Hitbtc extends EXCHANGE {
    constructor(key, secret, pass, tradeFees) {
        let cxt = new CCXT.hitbtc2({
            'apiKey': key,
            'secret': secret,
            enableRateLimit: true
        })
        super(cxt, key, secret, pass, tradeFees)        
        this.id = 'hitbtc'
        return this._initialize()
    }
}

module.exports = Hitbtc