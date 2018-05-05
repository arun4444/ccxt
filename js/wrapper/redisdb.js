"use strict"

const Redis = require("ioredis")

const state = {
    db: null
}

exports.connect = function () {
    state.db = new Redis()
}

exports.setPrices = async function (prices) {
    if (Array.isArray(prices)) {
        const pipeline = state.db.pipeline();
        for (let index = 0; index < prices.length; index++) {
            const element = prices[index]
            const key = "prices" + ":" + element.symbol + ":" + element.exchange
            pipeline.set(key, JSON.stringify(element))
            pipeline.expire(key, 20)
        }
        await pipeline.exec()
    } else {
        const key = "prices" + ":" + prices.symbol + ":" + prices.exchange
        await state.db.set(key, JSON.stringify(prices))
    }
}

exports.setBooks = async function (key, element) {
    await state.db.set(key, JSON.stringify(element))
    await state.db.expire(key, 20)
}

exports.del = async function (key) {
    await state.db.del(key)
}

exports.getOrderBook = async function (exchangeName, ticker) {
    return JSON.parse(await state.db.get("orderbook:"+exchangeName+":"+ticker))
}

exports.getAllPrices = async function () {
    const keys = await state.db.keys('prices:*')
    const vals = await state.db.mget(keys)
    const returner = []
    for (let index = 0; index < vals.length; index++) {
        const jsonObj = JSON.parse(vals[index])
        jsonObj.time = new Date(jsonObj.time)
        returner.push(jsonObj)     
    }
    return returner
}

exports.getPrice = async function (exchange, pair) {
    const jsonObj = JSON.parse(await state.db.get("prices:"+pair+":"+exchange))
    if(jsonObj){
        jsonObj.time = new Date(jsonObj.time)
        return jsonObj
    }
    return undefined
}

exports.getPrices = async function (exchangePairs) {
    const returner = []
    for (let i = 0; i < exchangePairs.length; i++) {
        const element = exchangePairs[i];
        const jsonObj = JSON.parse(await state.db.get("prices:"+element))
        if(jsonObj){
            jsonObj.time = new Date(jsonObj.time)
            returner.push(jsonObj)
        }
    }
    return returner
}

exports.getAllOrderBook = async function () {
    const keys = await state.db.keys('orderbook:*')
    const vals = await state.db.mget(keys)
    const returner = []
    for (let index = 0; index < vals.length; index++) {
        const jsonObj = JSON.parse(vals[index])
        returner.push(jsonObj)     
    }
    return returner
}

exports.sadd = async function(setName, member){
    await state.db.sadd(setName, member);
}

exports.sismember = async function(setName, member){
    const result = await state.db.sismember(setName, member)
    if (result === 1){
        return true
    }
    return false
}

exports.smembers = async function(setName){
    const result = await state.db.smembers(setName)
    return result
}