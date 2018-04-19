const KUCOIN = require('./kucoin.js')
const DB = require('../../db.js')

async function main() {
    const db = await DB.getExchange('kucoin')
    const exc = await new KUCOIN(db.apiKey, db.secret)
    console.log(await exc.ccxt.getCoinFees('BTC'))
}

main()