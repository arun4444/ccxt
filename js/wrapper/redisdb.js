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
        }
        await pipeline.exec()
    } else {
        const key = "prices" + ":" + prices.symbol + ":" + prices.exchange
        state.db.set(key, JSON.stringify(prices))
    }
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

exports.get = function () {
    return state.db
}