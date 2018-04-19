"use strict"

const EXCHANGE = require('./exchange.js')
const CCXT = require('../ccxt/ccxt.js')

class Gdax extends EXCHANGE {
    constructor(key, secret, pass, tradeFees) {
        let cxt = new CCXT.gdax({
            'apiKey': key,
            'secret': secret,
            'password': pass,
            enableRateLimit: true
        })
        super(cxt, key, secret, pass)        
        this.id = 'gdax'
        this.tradeFees = tradeFees
        return this._initialize()
    }
}

module.exports = Gdax