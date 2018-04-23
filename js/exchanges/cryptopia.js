"use strict"

const EXCHANGE = require('./exchange.js')
const CCXT = require('../../ccxt.js')

class Cryptopia extends EXCHANGE {
    constructor(key, secret, pass, tradeFees) {
        let cxt = new CCXT.cryptopia({
            'apiKey': key,
            'secret': secret,
            enableRateLimit: true
        })
        super(cxt, key, secret, pass)        
        this.id = 'cryptopia'
        this.tradeFees = tradeFees
        return this._initialize()
    }
}

module.exports = Cryptopia