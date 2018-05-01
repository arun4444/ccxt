"use strict";

var PINO
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

const RP = require('request-promise-native')
const BOTTLENECK = require("bottleneck")

const LIMITER = new BOTTLENECK({
    maxConcurrent: 2,
    highWater: 20,
    strategy: BOTTLENECK.strategy.OVERFLOW,
    minTime: 1000
});

const clickLink = async function (code, coin) {
    PINO.info("Clicking on link " + code + " " + coin)
    const options = {
        method: 'POST',
        uri: 'https://kitchen-3.kucoin.com/v1/account/ETC/open/wallet/confirm-withdraw-email?c=&lang=en_US',
        timeout: 10000,
        json: true,
        formData: {
            code: code,
            coin: coin,
        },
    }
    try {
        const postReq = await RP(options)
        PINO.info(postReq)
        return postReq
    } catch (e) {
        PINO.error(e)
        return { success: false }
    }
}

const withdraw = async function (exchange, toExchange, coin, amount, address, tag = undefined) {
    try {
        if (!EXCHANGES.get(exchange)) {
            throw new Error('Supplied Exchange "' + exchange + '" is not a valid tradeable exchange')
        }
        const exch = EXCHANGES.get(exchange)
        if (!exch.canonToNativeCoin.get(coin)) {
            throw new Error('Supplied Exchange "' + exchange + '" does not support coin ' + pair)
        }
        const coinNative = exch.canonToNativeCoin.get(coin)
        const coinCanon = coin
        PINO.info({
            msg: "Withdrawing Coin", loc: "exchangeActions,withdraw",
            exchange: exchange, coin: coin, amount: amount,
            address: address, tag: tag, nativeCoin: coinNative
        })
        const result = await exch.ccxt.withdraw(coinNative, amount, address, tag)
        result.coin = coin
        result.exchange = exchange
        PINO.info({ msg: "Post Withdrawing Coin", loc: "exchangeActions,withdraw", result: result })
        if (result.verifyURL) {
            const cde = result.verifyURL.split('=').pop();
            let jsonRes = await clickLink(cde, coinNative.toUpperCase())
            if (!jsonRes.success) {
                jsonRes = await clickLink(cde, coinNative.toUpperCase())
                if (!jsonRes.success) {
                    throw new Error('Could not confirm withdrawal!! ' + cde + coinNative.toUpperCase())
                }
            }
        }
        return result
    } catch (e) {
        const returner = { success: false, coin: coin, exchange: exchange, error: e }
        PINO.error({ msg: "Post Withdrawing Order", loc: "exchangeActions,withdrawOrder", result: returner })
        return returner
    }
}

const fetchOrder = async function (exchange, id, pair, side) {
    let isValid = false
    let isCanceled = false
    try{
        isValid = await RDB.sismember(exchange + ":new_order:" + pair + ":" + side, id)
        isCanceled = await RDB.sismember(exchange + ":canceled_order:" + pair + ":" + side, id)
    } catch (e){
        const returner = { success: false, symbol: pair, exchange: exchange, error: e }
        PINO.error({ msg: "Failed fetch valid order from REDIS",
            loc: "exchangeActions,FetchOrder", result: returner })
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
            msg: "Fetching Order", loc: "exchangeActions,fetchOrder",
            exchange: exchange, pair: pair, id: id,
            nativePair: pairNative
        })
        const result = await exch.ccxt.fetchOrder(id, pairNative, side)
        result.symbol = pair
        result.exchange = exchange
        PINO.info({ msg: "Post Fetching Order", loc: "exchangeActions,fetchOrder", result: result })
        if (!result.success && isCanceled) {
            return {
                'success': true,
                'orderId': id,
                'status': 'canceled',
                'amtFilled': null,
                'amtOriginal': null,
                'info': null,
                'symbol': pair,
                'exchange': exchange,
            }
        }
        if (!result.success && isValid) {
            return {
                'success': true,
                'orderId': id,
                'status': 'closed',
                'amtFilled': null,
                'amtOriginal': null,
                'info': null,
                'symbol': pair,
                'exchange': exchange,
            }
        }
        return result
    } catch (e) {
        const returner = { success: false, symbol: pair, exchange: exchange, error: e }
        PINO.error({ msg: "Post Fetching Order", loc: "exchangeActions,fetchOrder", result: returner })
        if (!returner.success && isCanceled) {
            return {
                'success': true,
                'orderId': id,
                'status': 'canceled',
                'amtFilled': null,
                'amtOriginal': null,
                'info': null,
                'symbol': pair,
                'exchange': exchange,
            }
        }

        if (!returner.success && isValid) {
            return {
                'success': true,
                'orderId': id,
                'status': 'closed',
                'amtFilled': null,
                'amtOriginal': null,
                'info': null,
                'symbol': pair,
                'exchange': exchange,
            }
        }
        return returner
    }
}

const cancelOrder = async function (exchange, id, pair, side) {
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
            msg: "Cancelling Order", loc: "exchangeActions,cancelOrder",
            exchange: exchange, pair: pair, id: id,
            nativePair: pairNative
        })
        const result = await exch.ccxt.cancelOrder(id, pairNative, side)
        result.symbol = pair
        result.exchange = exchange
        PINO.info({ msg: "Post cancelling Order", loc: "exchangeActions,fetchOrder", result: result })
        if (result.success) {
            const uniqueOrderId = result.exchange + ":canceled_order:" + pair + ":" + side
            await RDB.sadd(uniqueOrderId, id)
        }
        return result
    } catch (e) {
        const returner = { success: false, symbol: pair, exchange: exchange, error: e }
        PINO.error({ msg: "Post Cancelling Order", loc: "exchangeActions,cancelOrder", result: returner })
        return returner
    }
}

const createOrder = async function (exchange, pair, type, side, amountInTrade, priceInQuote) {
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
            msg: "Creating Order", loc: "exchangeActions,createOrder",
            exchange: exchange, pair: pair, type: type,
            side: side, amountInTrade: amountInTrade, priceInQuote: priceInQuote,
            nativePair: pairNative
        })
        const result = await exch.ccxt.createOrder(pairNative, type, side, amountInTrade, priceInQuote,
            nativeBaseCoin, nativeQuoteCoin)
        result.symbol = pair
        result.exchange = exchange
        PINO.info({ msg: "Post Creating Order", loc: "exchangeActions,createOrder", result: result })
        if (result.success) {
            const uniqueOrderId = result.exchange + ":new_order:" + pair + ":" + side
            await RDB.sadd(uniqueOrderId, result.orderId)
        }
        return result
    } catch (e) {
        const returner = { success: false, symbol: pair, exchange: exchange, error: e }
        PINO.error({ msg: "Post Creating Order", loc: "exchangeActions,createOrder", result: returner })
        return returner
    }
}

const init = async function (exchanges, logger) {
    await RDB.connect()
    PINO = logger
    for (let index = 0; index < exchanges.length; index++) {
        const exchange = exchanges[index]
        if (exchange.id === 'binance') {
            const binance = await new BINANCE(exchange.apiKey, exchange.secret)
            await binance.ccxt.loadMarkets()
            EXCHANGES.set(exchange.id, binance)
        }
        if (exchange.id === 'bittrex') {
            const bittrex = await new BITTREX(exchange.apiKey, exchange.secret)
            await bittrex.ccxt.loadMarkets()
            EXCHANGES.set(exchange.id, bittrex)
        }
        if (exchange.id === 'cryptopia') {
            const cryptopia = await new CRYPTOPIA(exchange.apiKey, exchange.secret)
            await cryptopia.ccxt.loadMarkets()
            EXCHANGES.set(exchange.id, cryptopia);
        }
        if (exchange.id === 'hitbtc') {
            const hitbtc = await new HITBTC(exchange.apiKey, exchange.secret)
            await hitbtc.ccxt.loadMarkets()
            EXCHANGES.set(exchange.id, hitbtc);
        }
        if (exchange.id === 'huobi') {
            const huobi = await new HUOBI(exchange.apiKey, exchange.secret)
            await huobi.ccxt.loadMarkets()
            EXCHANGES.set(exchange.id, huobi);
        }
        if (exchange.id === 'kucoin') {
            const kucoin = await new KUCOIN(exchange.apiKey, exchange.secret)
            await kucoin.ccxt.loadMarkets()
            EXCHANGES.set(exchange.id, kucoin);
        }
        if (exchange.id === 'gdax') {
            const gdax = await new GDAX(exchange.apiKey, exchange.secret, exchange.password)
            await gdax.ccxt.loadMarkets()
            EXCHANGES.set(exchange.id, gdax);
        }
        if (exchange.id === 'gemini') {
            const gemini = await new GEMINI(exchange.apiKey, exchange.secret)
            await gemini.ccxt.loadMarkets()
            EXCHANGES.set(exchange.id, gemini);
        }
        if (exchange.id === 'bitflyer') {
            const bitflyer = await new BITFLYER(exchange.apiKey, exchange.secret)
            await bitflyer.ccxt.loadMarkets()
            EXCHANGES.set(exchange.id, bitflyer);
        }
    }
}

// async function main() {
//     await init()
    //console.log(await createOrder('binance', 'ADA/BTC', 'limit', 'buy', 84, 0.00001193999999))
    //console.log(await cancelOrder('binance', 20759607, 'ADA/BTC', "sell"))
    //console.log(await fetchOrder('binance', 207539607, 'ADA/BTC', "sell"))
    //console.log(await withdraw('binance', 'ADA', 84.12242300, "DdzFFzCqrht56gbJxPdUD9t8np2Qe7ayWiNr2xqQXDRnxD3YUjsMyNqJoVg6SLU1cC6RnTvvjtsRRLgeg1rBkAuSURNJjqHjozLhcgVN"))

    //console.log(await createOrder('bittrex', 'ADA/BTC', 'limit', 'sell', 83, 0.00005165))
    //console.log(await createOrder('bittrex', 'DOGE/BTC', 'limit', 'buy', 3000, 0.00000041))
    //console.log(await cancelOrder('bittrex', "b1edce1d-998c-4deb-a6e6-eb7de63da6d1", 'ADA/BTC', "sell"))
    //console.log(await fetchOrder('bittrex', "b1edc4e1d-998c-4deb-a6e6-eb7de63da6d1", 'ADA/BTC', "sell"))
    //console.log(await withdraw('bittrex', 'DOGE', 4897, "DBbEg8EgjGekmkCzGnJrJnZtvJSvPHAbif"))

    //console.log(await createOrder('cryptopia', 'ETC/BTC', 'limit', 'sell', 1.4, 0.00502986))
    //console.log(await createOrder('cryptopia', 'DOGE/BTC', 'limit', 'buy', 5000, 0.00000041))
    //console.log(await cancelOrder('cryptopia', 532011317, 'ETC/BTC', "sell"))
    //console.log(await fetchOrder('cryptopia', 532011317, 'ETC/BTC', "sell"))
    //console.log(await withdraw('cryptopia', 'DOGE', 5000, "D6pTddtUCZs2HDCzqEiieVGT1dtB2GKXRU"))

    //console.log(await createOrder('hitbtc', 'DOGE/BTC', 'limit', 'sell', 1000, 0.00000071))
    //console.log(await createOrder('hitbtc', 'DOGE/BTC', 'limit', 'buy', 1000, 0.000000454))
    //console.log(await cancelOrder('hitbtc', "bdadaebb471244f6a58ee9ae5448f830", 'DOGE/BTC', "sell"))
    //console.log(await fetchOrder('hitbtc', "bdadaebb471244f6a58ee9ae5448f830", 'DOGE/BTC', "sell"))
    //console.log(await withdraw('hitbtc', 'XRP', 20, "rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh", "104277335"))

    //console.log(await createOrder('huobi', 'ETC/BTC', 'limit', 'sell', 0.45, 0.002865))
    //console.log(await createOrder('huobi', 'ETC/BTC', 'limit', 'buy', 0.45, 0.002))
    //console.log(await cancelOrder('huobi', "3042685554", 'ETC/BTC', "sell"))
    //console.log(await fetchOrder('huobi', "3042685554", 'ETC/BTC', "sell"))
    //console.log(await withdraw('huobi', 'XRP', 20, "rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh", "104277335"))

    //console.log(await createOrder('kucoin', 'LEND/BTC', 'limit', 'buy', 15, 0.00000386))
    //console.log(await createOrder('kucoin', 'ETC/BTC', 'limit', 'buy', 0.5,  0.00198472))
    //console.log(await cancelOrder('kucoin', "5ac525c94375827718fed6dd", 'LEND/BTC', "sell"))
    //console.log(await fetchOrder('kucoin', "5ac52af84375827718fed6e1", 'LEND/BTC', "buy"))
    //console.log(await withdraw('kucoin', 'ETC', 0.4995, "rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh"))

    //console.log(await createOrder('gdax', 'ETH/BTC', 'limit', 'buy', 0.01, 0.01845))
    //console.log(await createOrder('gdax', 'ETH/BTC', 'limit', 'buy', 0.04, 0.05931))
    //console.log(await cancelOrder('gdax', "931afec5-7d72-42b4-8a6c-714f72047415", 'ETH/BTC', "buy"))
    //console.log(await fetchOrder('gdax', "931afehc5-7d72-42b4-8a6c-714f72047415", 'ETH/BTC', "buy"))
    //console.log(await withdraw('gdax', 'ETH', 0.04, "0xf80Aca3D4786EbF8e3be2Da6099bCcD9BdbE1050"))

    //console.log(await createOrder('gemini', 'ETH/BTC', 'limit', 'sell', 0.04, 0.06035))
    //console.log(await createOrder('gemini', 'ETH/BTC', 'limit', 'buy', 0.04, 0.05931))
    //console.log(await cancelOrder('gemini', "3431624238", 'ETH/BTC', "sell"))
    //console.log(await fetchOrder('gemini', "3431624238", 'ETH/BTC', "sell"))
    //console.log(await withdraw('gemini', 'ETH', 0.04, "0xf80Aca3D4786EbF8e3be2Da6099bCcD9BdbE1050"))

    //console.log(await createOrder('gemini', 'ETH/BTC', 'limit', 'sell', 0.04, 0.06035))
    //console.log(await createOrder('gemini', 'ETH/BTC', 'limit', 'buy', 0.04, 0.05931))
    //console.log(await cancelOrder('gemini', "3431624238", 'ETH/BTC', "sell"))
    //console.log(await fetchOrder('gemini', "3431624238", 'ETH/BTC', "sell"))
    //console.log(await withdraw('gemini', 'ETH', 0.04, "0xf80Aca3D4786EbF8e3be2Da6099bCcD9BdbE1050"))

    //console.log(await createOrder('bitflyer', 'BTC/USD', 'limit', 'sell', 0.01, 8000))
    //console.log(await createOrder('gemini', 'ETH/BTC', 'limit', 'buy', 0.04, 0.05931))
    //console.log(await cancelOrder('bitflyer', "JRF20180405-131230-304275", 'BTC/USD', "sell"))
    //console.log(await fetchOrder('bitflyer', "JRF20180405-131230-304275", 'BTC/USD', "sell"))
    //console.log(await withdraw('gemini', 'ETH', 0.04, "0xf80Aca3D4786EbF8e3be2Da6099bCcD9BdbE1050"))
// }
// main()

module.exports = {
    init: init, createOrder: createOrder,
    cancelOrder: cancelOrder, fetchOrder: fetchOrder, withdraw: withdraw
};
