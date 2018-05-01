"use strict";

var PINO
const DBSPREADS = require('./db-spreads.js')
const DBMOCK = require('./db.mock.js')
const RDB = require('./redisdb.js')

const BINANCE = require('../exchanges/binance.js')
const BITTREX = require('../exchanges/bittrex.js')
const CRYPTOPIA = require('../exchanges/cryptopia.js')
const HITBTC = require('../exchanges/hitbtc.js')
const HUOBI = require('../exchanges/huobi.js')
const KUCOIN = require('../exchanges/kucoin.js')
const BITFLYER = require('../exchanges/bitflyer.js')
const GDAX = require('../exchanges/gdax.js')
const GEMINI = require('../exchanges/gemini.js')

const EXCHANGES = new Map()

const withdraw = async function (exchange, toExchange, coin, amount, address, tag = undefined) {
    try {
        if (!EXCHANGES.get(exchange) || !EXCHANGES.get(toExchange)) {
            throw new Error('Supplied Exchange "' + exchange + '" is not a valid tradeable exchange')
        }
        const exch = EXCHANGES.get(exchange)
        const exchTo = EXCHANGES.get(toExchange)
        let result = {
            'success': false,
        }
        PINO.info({
            msg: "Withdrawing Mock Coin", loc: "exchangeActions,withdraw",
            exchange: exchange, coin: coin, amount: amount,
            address: address, tag: tag
        })
        const feesA = await DBMOCK.fetchFeesExchange(exchange, coin)
        let fees
        if (Array.isArray(feesA) && feesA.length > 0) {
            fees = feesA[0]
        } else {
            throw new Error('Could not fetch fees for '+exchange+" "+coin)
        }

        const balances = (await DBMOCK.fetchmock_balancesExch(exchange))
        const balancesDeposit = (await DBMOCK.fetchmock_balancesExch(toExchange))
        if (Array.isArray(balances) && balances.length > 0) {
            if (Array.isArray(balancesDeposit) && balancesDeposit.length > 0) {
                const balance = balances[0].free
                const canonBalance = Number(balance[coin])
                if (isNaN(canonBalance)) {
                    throw new Error('Your Balance ' + canonBalance + " is NaN")
                }
                const balanceDep = balancesDeposit[0].free
                const balanceDepCoin = Number(balanceDep[coin])
                if (isNaN(balanceDepCoin)) {
                    throw new Error('Your Balance ' + balanceDepCoin + " is NaN")
                }
                if (canonBalance < amount) {
                    throw new Error('Your Balance ' + canonBalance + " is < " + amount)
                }
                if(!fees.withdrawEnabled){
                    throw new Error('Your Coin ' + coin + " is not withdraw enabled")
                } 
                if(fees.minimumWithdraw > amount){
                    throw new Error('Your amount ' + amount + " is less than minimum withdraw")
                } 
                const newWithdrawBalance = canonBalance - amount
                const newDepositBalance = balanceDepCoin + (amount - fees.withdrawalFee)
                balances[0].free[coin] = newWithdrawBalance
                balancesDeposit[0].free[coin] = newDepositBalance
                await DBMOCK.insertmock_balances(balances[0])
                await DBMOCK.insertmock_balances(balancesDeposit[0])
                result = {
                    'success': true,
                    'id': (new Date()).getTime(),
                }
            }
        }
        result.coin = coin
        result.exchange = exchange
        PINO.info({ msg: "Post Withdrawing Mock Coin", loc: "exchangeActions,withdraw", result: result })
        return result
    } catch (e) {
        const returner = { success: false, coin: coin, exchange: exchange, error: e }
        PINO.error({ msg: "Post Withdrawing Mock Order", loc: "exchangeActions,withdrawOrder", result: returner })
        return returner
    }
}

const fetchOrder = async function (exchange, id, pair, side) {
    let isValid = false
    let isCanceled = false
    try {
        isValid = await RDB.sismember(exchange + ":mock_new_order:" + pair + ":" + side, id)
        isCanceled = await RDB.sismember(exchange + ":mock_canceled_order:" + pair + ":" + side, id)
    } catch (e) {
        const returner = { success: false, symbol: pair, exchange: exchange, error: e }
        PINO.error({
            msg: "Failed fetch valid order from REDIS",
            loc: "exchangeActions,FetchOrder", result: returner
        })
        return returner
    }
    try {
        if (!EXCHANGES.get(exchange)) {
            throw new Error('Supplied Exchange "' + exchange + '" is not a valid tradeable exchange')
        }
        const exch = EXCHANGES.get(exchange)
        if (!exch.canonToNativePairs.get(pair)) {
            throw new Error('Supplied Exchange "' + exchange + '" does not support pair ' + pair)
        }
        const pairNative = exch.canonToNativePairs.get(pair)
        const pairCanon = pair
        PINO.info({
            msg: "Fetching Mock Order", loc: "exchangeActions,fetchOrder",
            exchange: exchange, pair: pair, id: id,
            nativePair: pairNative
        })
        if (!isValid) {
            throw new Error('Supplied orderId "' + id + '" is invalid')
        }
        let result = convertIdToOrder(id)
        if (isCanceled) {
            result.status = 'canceled'
        }
        result.success = true
        result.symbol = pair
        result.exchange = exchange
        PINO.info({ msg: "Post Fetching Mock Order", loc: "exchangeActions,fetchOrder", result: result })
        return result
    } catch (e) {
        const returner = { success: false, symbol: pair, exchange: exchange, error: e }
        PINO.error({ msg: "Post Fetching Order", loc: "exchangeActions,fetchOrder", result: returner })
        return returner
    }
}

const cancelOrder = async function (exchange, id, pair, side) {
    let result = { success: false, symbol: pair, exchange: exchange }
    let isValid = false
    let isCanceled = false
    try {
        isValid = await RDB.sismember(exchange + ":mock_new_order:" + pair + ":" + side, id)
        isCanceled = await RDB.sismember(exchange + ":mock_canceled_order:" + pair + ":" + side, id)
    } catch (e) {
        const returner = { success: false, symbol: pair, exchange: exchange, error: e }
        PINO.error({
            msg: "Failed fetch valid order from REDIS",
            loc: "exchangeActions,FetchOrder", result: returner
        })
        return returner
    }
    try {
        if (!EXCHANGES.get(exchange)) {
            throw new Error('Supplied Exchange "' + exchange + '" is not a valid tradeable exchange')
        }
        const exch = EXCHANGES.get(exchange)
        if (!exch.canonToNativePairs.get(pair)) {
            throw new Error('Supplied Exchange "' + exchange + '" does not support pair ' + pair)
        }
        const pairNative = exch.canonToNativePairs.get(pair)
        const pairCanon = pair
        PINO.info({
            msg: "Cancelling Mock Order", loc: "exchangeActions,cancelOrder",
            exchange: exchange, pair: pair, id: id,
            nativePair: pairNative
        })
        if (!isValid) {
            throw new Error('Supplied Order ' + id + ' is invalid')
        }
        const ordersky = convertIdToOrder(id)
        if (isValid && isCanceled) {
            throw new Error('Supplied Order ' + id + ' has already been canceled')
        }
        if (isValid && !isCanceled && ordersky.status === 'open') {
            const canonBaseCoin = pair.split("/")[0]
            const canonQuoteCoin = pair.split("/")[1]
            const balances = (await DBMOCK.fetchmock_balancesExch(exchange))
            if (Array.isArray(balances) && balances.length > 0) {
                const balance = balances[0].free
                const canonBaseCoinBalance = Number(balance[canonBaseCoin]) || 0
                const canonQuoteCoinBalance = Number(balance[canonQuoteCoin]) || 0
                if (isNaN(canonQuoteCoinBalance) || isNaN(canonBaseCoinBalance)) {
                    throw new Error('Your Balance ' + canonQuoteCoinBalance + " or " + canonBaseCoinBalance + " is NaN")
                }
                if (side === 'buy') {
                    const newQuoteBalance = canonQuoteCoinBalance + (ordersky.amtOriginal * ordersky.quotePrice)
                    const newBaseBalance = canonBaseCoinBalance
                    balances[0].free[canonBaseCoin] = newBaseBalance
                    balances[0].free[canonQuoteCoin] = newQuoteBalance
                    await DBMOCK.insertmock_balances(balances[0])
                }
                if (side === 'sell') {
                    const newQuoteBalance = canonQuoteCoinBalance
                    const newBaseBalance = canonBaseCoinBalance + ordersky.amtOriginal
                    balances[0].free[canonBaseCoin] = newBaseBalance
                    balances[0].free[canonQuoteCoin] = newQuoteBalance
                    await DBMOCK.insertmock_balances(balances[0])
                }
            }
            result = { success: true }
        } else {
            throw new Error('Supplied Order ' + id + ' is closed and cannot be canceled')
        }

        result.symbol = pair
        result.exchange = exchange
        PINO.info({ msg: "Post cancelling Mock Order", loc: "exchangeActions,fetchOrder", result: result })
        if (result.success) {
            const uniqueOrderId = result.exchange + ":mock_canceled_order:" + pair + ":" + side
            await RDB.sadd(uniqueOrderId, id)
        }
        return result
    } catch (e) {
        const returner = { success: false, symbol: pair, exchange: exchange, error: e }
        PINO.error({ msg: "Post Cancelling Order", loc: "exchangeActions,cancelOrder", result: returner })
        return returner
    }
}

const convertOrderToId = function (order, price) {
    return (new Date()).getTime() + "+" + order.success + ":" + order.status + ":" + order.amtFilled + ":" + order.amtOriginal + ":" + price
}

const convertIdToOrder = function (id) {
    const ss = id.split(":");
    const orderId = id
    const status = ss[1]
    const amtFilled = Number(ss[2])
    const amtOriginal = Number(ss[3])
    const quotePrice = Number(ss[4])
    return {
        'orderId': orderId,
        'status': status,
        'amtFilled': amtFilled,
        'amtOriginal': amtOriginal,
        'quotePrice': quotePrice,
    }
}

const createOrder = async function (exchange, pair, type, side, amountInTrade, priceInQuote) {
    try {
        if (!EXCHANGES.get(exchange)) {
            throw new Error('Supplied Exchange ' + exchange + ' is not a valid tradeable exchange')
        }
        const exch = EXCHANGES.get(exchange)
        if (!exch.canonToNativePairs.get(pair)) {
            throw new Error('Supplied Exchange ' + exchange + ' does not support pair ' + pair)
        }
        let result = { success: false, symbol: pair, exchange: exchange }
        const priceData = await DBSPREADS.fetchExchangeData()
        const prices = priceData.priceLookup.get(exchange + ":" + pair)
        if (typeof prices === 'undefined') {
            throw new Error('Supplied Exchange ' + exchange + ' does not have a price for ' + pair)
        }
        const fees = Number(exch.tradeFees.maker)
        if (isNaN(fees)) {
            throw new Error("Supplied Exchange " + exchange + " does not have fees defined")
        }
        const pairNative = exch.canonToNativePairs.get(pair)
        const pairCanon = pair
        const canonBaseCoin = pair.split("/")[0]
        const canonQuoteCoin = pair.split("/")[1]
        const nativeBaseCoin = exch.canonToNativeCoin.get(canonBaseCoin)
        const nativeQuoteCoin = exch.canonToNativeCoin.get(canonQuoteCoin)
        if (type !== 'limit' && type !== 'market') {
            throw new Error('Supplied Exchange "' + exchange + '" does not support order type ' + type)
        }
        if (side !== 'buy' && side !== 'sell') {
            throw new Error('Side must be either buy or sell supplied: ' + side)
        }
        if (type === 'limit' && isNaN(priceInQuote)) {
            throw new Error('For limit orders, price needs to be supplied')
        }
        PINO.info({
            msg: "Creating Mock Order", loc: "exchangeActions,createOrder",
            exchange: exchange, pair: pair, type: type,
            side: side, amountInTrade: amountInTrade, priceInQuote: priceInQuote,
            nativePair: pairNative
        })
        const balances = (await DBMOCK.fetchmock_balancesExch(exchange))
        if (Array.isArray(balances) && balances.length > 0) {
            const balance = balances[0].free
            const canonBaseCoinBalance = Number(balance[canonBaseCoin]) || 0
            const canonQuoteCoinBalance = Number(balance[canonQuoteCoin]) || 0
            if (isNaN(canonQuoteCoinBalance) || isNaN(canonBaseCoinBalance)) {
                throw new Error('Your Balance ' + canonQuoteCoinBalance + " or " + canonBaseCoinBalance + " is NaN")
            }
            if (side === 'buy') {
                if (canonQuoteCoinBalance < (priceInQuote * amountInTrade)) {
                    throw new Error('Your Balance ' + canonQuoteCoinBalance + " is < amountInTrade times priceInQuote " + amountInTrade)
                }
                if (prices.ask < (priceInQuote+(priceInQuote*0.005))) {
                    let fetchResult = {
                        'success': true,
                        'status': 'closed',
                        'amtFilled': Number(amountInTrade),
                        'amtOriginal': Number(amountInTrade)
                    }
                    const newQuoteBalance = canonQuoteCoinBalance - (prices.ask * amountInTrade)
                    const newBaseBalance = canonBaseCoinBalance + (amountInTrade - (amountInTrade * fees))
                    balances[0].free[canonBaseCoin] = newBaseBalance
                    balances[0].free[canonQuoteCoin] = newQuoteBalance
                    await DBMOCK.insertmock_balances(balances[0])
                    result = {
                        'success': true,
                        'orderId': convertOrderToId(fetchResult, prices.ask)
                    }
                } else {
                    let fetchResult = {
                        'success': true,
                        'status': 'open',
                        'amtFilled': 0,
                        'amtOriginal': Number(amountInTrade)
                    }
                    const newQuoteBalance = canonQuoteCoinBalance - (priceInQuote * amountInTrade)
                    const newBaseBalance = canonBaseCoinBalance
                    balances[0].free[canonBaseCoin] = newBaseBalance
                    balances[0].free[canonQuoteCoin] = newQuoteBalance
                    await DBMOCK.insertmock_balances(balances[0])
                    result = {
                        'success': true,
                        'orderId': convertOrderToId(fetchResult, priceInQuote)
                    }
                }
            }
            if (side === 'sell') {
                if (canonBaseCoinBalance < amountInTrade) {
                    throw new Error('Your Balance ' + canonBaseCoinBalance + " is < amountInTrade " + amountInTrade)
                }
                if (prices.bid > (priceInQuote-(priceInQuote*0.005))) {
                    let fetchResult = {
                        'success': true,
                        'status': 'closed',
                        'amtFilled': Number(amountInTrade),
                        'amtOriginal': Number(amountInTrade)
                    }
                    const newQuoteBalance = canonQuoteCoinBalance + ((priceInQuote * amountInTrade) - ((priceInQuote * amountInTrade) * fees))
                    const newBaseBalance = canonBaseCoinBalance - amountInTrade
                    balances[0].free[canonBaseCoin] = newBaseBalance
                    balances[0].free[canonQuoteCoin] = newQuoteBalance
                    await DBMOCK.insertmock_balances(balances[0])
                    result = {
                        'success': true,
                        'orderId': convertOrderToId(fetchResult, priceInQuote)
                    }
                } else {
                    let fetchResult = {
                        'success': true,
                        'status': 'open',
                        'amtFilled': 0,
                        'amtOriginal': Number(amountInTrade)
                    }
                    const newQuoteBalance = canonQuoteCoinBalance
                    const newBaseBalance = canonBaseCoinBalance - amountInTrade
                    balances[0].free[canonBaseCoin] = newBaseBalance
                    balances[0].free[canonQuoteCoin] = newQuoteBalance
                    await DBMOCK.insertmock_balances(balances[0])
                    result = {
                        'success': true,
                        'orderId': convertOrderToId(fetchResult, priceInQuote)
                    }
                }
            }
        } else {
            throw new Error('Could not fetch balances for exchange ' + exchange)
        }
        result.symbol = pair
        result.exchange = exchange
        PINO.info({ msg: "Post Creating Mock Order", loc: "exchangeActions,createOrder", result: result })
        if (result.success) {
            const uniqueOrderId = result.exchange + ":mock_new_order:" + pair + ":" + side
            await RDB.sadd(uniqueOrderId, result.orderId)
        }
        return result
    } catch (e) {
        const returner = { success: false, symbol: pair, exchange: exchange, error: e }
        PINO.error({ msg: "Post Creating Mock Order", loc: "exchangeActions,createOrder", result: returner })
        return returner
    }
}

const init = async function (exchanges, logger) {
    await RDB.connect()
    await DBSPREADS.init()
    PINO = logger
    for (let index = 0; index < exchanges.length; index++) {
        const exchange = exchanges[index]
        if (exchange.id === 'binance') {
            const binance = await new BINANCE(exchange.apiKey, exchange.secret, undefined, exchange.tradeFee)
            await binance.ccxt.loadMarkets()
            EXCHANGES.set(exchange.id, binance)
        }
        if (exchange.id === 'bittrex') {
            const bittrex = await new BITTREX(exchange.apiKey, exchange.secret, undefined, exchange.tradeFee)
            await bittrex.ccxt.loadMarkets()
            EXCHANGES.set(exchange.id, bittrex)
        }
        if (exchange.id === 'cryptopia') {
            const cryptopia = await new CRYPTOPIA(exchange.apiKey, exchange.secret, undefined, exchange.tradeFee)
            await cryptopia.ccxt.loadMarkets()
            EXCHANGES.set(exchange.id, cryptopia);
        }
        if (exchange.id === 'hitbtc') {
            const hitbtc = await new HITBTC(exchange.apiKey, exchange.secret, undefined, exchange.tradeFee)
            await hitbtc.ccxt.loadMarkets()
            EXCHANGES.set(exchange.id, hitbtc);
        }
        if (exchange.id === 'huobi') {
            const huobi = await new HUOBI(exchange.apiKey, exchange.secret, undefined, exchange.tradeFee)
            await huobi.ccxt.loadMarkets()
            EXCHANGES.set(exchange.id, huobi);
        }
        if (exchange.id === 'kucoin') {
            const kucoin = await new KUCOIN(exchange.apiKey, exchange.secret, undefined, exchange.tradeFee)
            await kucoin.ccxt.loadMarkets()
            EXCHANGES.set(exchange.id, kucoin);
        }
        if (exchange.id === 'gdax') {
            const gdax = await new GDAX(exchange.apiKey, exchange.secret, exchange.password, exchange.tradeFee)
            await gdax.ccxt.loadMarkets()
            EXCHANGES.set(exchange.id, gdax);
        }
        if (exchange.id === 'gemini') {
            const gemini = await new GEMINI(exchange.apiKey, exchange.secret, undefined, exchange.tradeFee)
            await gemini.ccxt.loadMarkets()
            EXCHANGES.set(exchange.id, gemini);
        }
        if (exchange.id === 'bitflyer') {
            const bitflyer = await new BITFLYER(exchange.apiKey, exchange.secret, undefined, exchange.tradeFee)
            await bitflyer.ccxt.loadMarkets()
            EXCHANGES.set(exchange.id, bitflyer);
        }
    }
}

// async function main() {
//     await RDB.connect()
//     await init()
//     await DBSPREADS.init()
//     //console.log(await createOrder('binance', 'ADA/BTC', 'limit', 'buy', 100, 0.00001208))
//     //console.log(await cancelOrder('bittrex', "1523308052112+true:open:0:25.415846768505393:0.00418243", 'XZC/BTC', "buy"))
//     //console.log(await cancelOrder('cryptopia', "1523308521744+true:open:0:25.00896243832843:0.00429906", 'XZC/BTC', "sell"))

//     console.log(await fetchOrder('bittrex', "1523309767219+true:closed:25.415239101692038:25.415239101692038:0.00418349", 'XZC/BTC', "buy"))
//     //console.log(await withdraw('binance', "bittrex",'ADA', 10, "DdzFFzCqrht56gbJxPdUD9t8np2Qe7ayWiNr2xqQXDRnxD3YUjsMyNqJoVg6SLU1cC6RnTvvjtsRRLgeg1rBkAuSURNJjqHjozLhcgVN"))
// }

// main()

module.exports = {
    init: init, createOrder: createOrder,
    cancelOrder: cancelOrder, fetchOrder: fetchOrder, withdraw: withdraw
};