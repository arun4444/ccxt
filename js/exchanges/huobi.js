"use strict"

const EXCHANGE = require('./exchange.js')
const CCXT = require('../../ccxt.js')

class Huobi extends EXCHANGE {
    constructor(key, secret, pass, tradeFees) {
        let cxt = new CCXT.huobipro({
            'apiKey': key,
            'secret': secret,
            enableRateLimit: true
        })
        super(cxt, key, secret, pass)        
        this.id = 'huobi'
        this.tradeFees = tradeFees
        return this._initialize()
    }
}

module.exports = Huobi