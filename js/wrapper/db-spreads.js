"use strict";

const db = require('./db.js');
const rdb = require('./redisdb.js');

function pairsArray(arr) {
	var res = [],
		l = arr.length;
	for (var i = 0; i < l; ++i)
		for (var j = i + 1; j < l; ++j)
			res.push([arr[i], arr[j]]);
	return res;
}

const exchanges = []
const pairs = []
const priceLookup = new Map()
const spreadLookup = new Map()
var spreads = []
var lastUpdate

function compareSpread(a, b) {
	if (a.percentSpread < b.percentSpread)
		return 1;
	if (a.percentSpread > b.percentSpread)
		return -1;
	return 0;
}

function getSpreadWorker(commonTicks, pairA, pairB) {
	try {
		const element = commonTicks
		let pairsR = []
		const keyA = pairA.id + ":" + element
		const keyB = pairB.id + ":" + element

		pairsR.push(priceLookup.get(keyA))
		pairsR.push(priceLookup.get(keyB))

		if (pairsR.length == 2 && typeof pairsR[0] != 'undefined'
			&& typeof pairsR[1] != 'undefined') {
			const exA = pairsR[0]
			const exB = pairsR[1]

			const buyASellB = (Number(exB.bid) - Number(exA.ask)) / Number(exA.ask)
			const buyBSellA = (Number(exA.bid) - Number(exB.ask)) / Number(exB.ask)
			const volA = Number(exA.volume_24h)
			const volB = Number(exB.volume_24h)
			const timeA = exA.time
			const timeB = exB.time
			const lowestVolume = Math.min(volA, volB)
			const deltaTime = Math.abs(timeA - timeB)
			let bid = 0;
			let ask = 0;
			let buyExchange = '';
			let sellExchange = '';
			let bt = new Date();
			let st = new Date();

			if (buyASellB > buyBSellA) {
				bid = exB.bid
				ask = exA.ask
				buyExchange = exA.exchange
				sellExchange = exB.exchange
				bt = timeA;
				st = timeB;
			} else {
				bid = exA.bid
				ask = exB.ask
				buyExchange = exB.exchange
				sellExchange = exA.exchange
				bt = timeB;
				st = timeA;
			}

			const resultant = {
				id: [exA.exchange, exB.exchange, element],
				buyExchangeTime: bt, sellExchangeTime: st,
				percentSpread: Math.max(buyASellB, buyBSellA),
				buyExchange: buyExchange, sellExchange: sellExchange,
				pair: element, lowestVolume: lowestVolume
				, deltaTime: deltaTime, ask: ask, bid: bid,
			}
			spreads.push(resultant)
			spreadLookup.set(buyExchange + ":" + sellExchange + ":" + element, resultant)
		}
	} catch (e) {
		console.error(e)
	}
}

function getSpread(pr) {
	let pair = pr.pair
	let commonTicks = pr.commonTicks
	for (let i = 0; i < commonTicks.length; i++) {
		getSpreadWorker(commonTicks[i], pair[0], pair[1])
	}
}

const fetchExchangeData = async function () {
	const startTime = new Date()
	let priceDatum = await rdb.getAllPrices()
	lastUpdate = new Date()

	priceLookup.clear()
	spreadLookup.clear()
	spreads = []

	for (let d = 0; d < priceDatum.length; d++) {
		const priceData = priceDatum[d];
		priceLookup.set(priceData.exchange + ":" + priceData.symbol, priceData);
	}

	for (let m = 0; m < pairs.length; m++) {
		const element = pairs[m]
		getSpread(element)
	}

	spreads.sort(compareSpread);

	const endTime = new Date()
	const metric = endTime - startTime

	//console.log({message: "DB: Fetched spreads/tickers (" +metric+" ms)", type: 'db'});
	return { spreadsArraySorted: spreads, spreadsLookup: spreadLookup, priceLookup: priceLookup, 
		dbTimestamp:lastUpdate }
}

const init = async function () {
	let exc = await db.getExchangesArray()
	await rdb.connect()

	exchanges.length = 0
	pairs.length = 0

	for (let i = 0; i < exc.length; i++) {
		exchanges.push(exc[i]);
	}

	let pairss = pairsArray(exchanges);

	for (let i = 0; i < pairss.length; i++) {
		let commonTicks = await db.getCommonTickers(pairss[i][0], pairss[i][1]);
		pairs.push({ pair: pairss[i], commonTicks: commonTicks });
	}
}

module.exports = {init: init, fetchExchangeData: fetchExchangeData};