"use strict"

const EXCHANGE = require('./exchange.js')
const CCXT = require('../../ccxt.js')

class Bitflyer extends EXCHANGE {
    constructor(key, secret, pass, tradeFees) {
        let cxt = new CCXT.bitflyer({
            'apiKey': key,
            'secret': secret,
            enableRateLimit: true
        })
        cxt.urls.api = 'https://api.bitflyer.com'
        super(cxt, key, secret, pass)        
        this.id = 'bitflyer'
        this.tradeFees = tradeFees
        return this._initialize()
    }
}

module.exports = Bitflyer