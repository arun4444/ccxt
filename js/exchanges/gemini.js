"use strict"

const EXCHANGE = require('./exchange.js')
const CCXT = require('../ccxt/ccxt.js')

class Gemini extends EXCHANGE {
    constructor(key, secret, pass, tradeFees) {
        let cxt = new CCXT.gemini({
            'apiKey': key,
            'secret': secret,
            enableRateLimit: true
        })
        super(cxt, key, secret, pass)        
        this.id = 'gemini'
        this.tradeFees = tradeFees
        return this._initialize()
    }
}

module.exports = Gemini