const rdb = require('rethinkdbdash')();
const SimpleCryptoJS = require('simple-crypto-js');
let simpleCryptoPass = 'moo';
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

if (typeof process.argv.slice(2)[0] != 'undefined') {
    simpleCryptoPass = process.argv.slice(2)[0];
}
const simpleCrypto = new SimpleCryptoJS.default(simpleCryptoPass);

const db = {
    getExchanges: async function () {
        const objExchanges = {};
        const exchanges = await rdb.db('crypto_arb').table('exchanges').run();
        for (let exchangeInfo of exchanges) {
            if (exchangeInfo.apiKey && exchangeInfo.secret) {
                try {
                    exchangeInfo.apiKey = simpleCrypto.decrypt(exchangeInfo.apiKey);
                    exchangeInfo.secret = simpleCrypto.decrypt(exchangeInfo.secret);
                    if (exchangeInfo.password) exchangeInfo.password = simpleCrypto.decrypt(exchangeInfo.password);
                } catch (e) {
                    global._logErr({message: 'DB: Get Exchange Info Error', error: e});
                }
            }
            let exchangeName = exchangeInfo.name;
            objExchanges[exchangeName] = exchangeInfo;
        }
        return objExchanges;
    },

    getExchangesArray: async function () {
        const objExchanges = [];
        const exchanges = await rdb.db('crypto_arb').table('exchanges').run();
        for (let i = 0; i < exchanges.length; i++) {
            let exchangeInfo = exchanges[i];
            if (exchangeInfo.apiKey && exchangeInfo.secret) {
                try {
                    exchangeInfo.apiKey = simpleCrypto.decrypt(exchangeInfo.apiKey);
                    exchangeInfo.secret = simpleCrypto.decrypt(exchangeInfo.secret);
                    if (exchangeInfo.password) exchangeInfo.password = simpleCrypto.decrypt(exchangeInfo.password);
                } catch (e) {
                    //console.log(e);
                }
            }
            objExchanges.push(exchangeInfo);
        }
        return objExchanges;
    },

    getSymbols: async function () {
        const symbols = await rdb.db('crypto_arb').table('coins').run();
        return symbols;
    },

    fetchmock_balances: async function () {
        const mock_balances = await rdb.db('crypto_arb').table('mock_balances').run();
        return mock_balances;
    },

    fetchmock_balancesExch: async function (exchange) {
        const mock_balances = await rdb.db('crypto_arb').table('mock_balances').filter({id: exchange}).run();
        return mock_balances;
    },

    subscribeToBalanceUpdates: async function (handler) {
        global._log({message: "<< Subscribe to Balance Updates", type: 'init'});
        try {
            var feed = await rdb.db('crypto_arb').table('mock_balances').changes().run();
            feed.each(function (err, change) {
                handler([change.new_val]);
            });
        } catch (e) {
            global._logErr({message: "Balance update error", error: e});
        }
    },

    getDbTime: async function () {
        return rdb.now().run();
    },

    fetchDepositAddresses: async function () {
        return await rdb.db('crypto_arb').table('deposit_address').run();
    },

    subscribeToDepositAddressUpdates: async function (handler) {
        global._log({message: "<< Subscribe to Deposit Address Updates", type: 'init'});
        try {
            var feed = await rdb.db('crypto_arb').table('deposit_address').changes().run();
            feed.each(function (err, change) {
                handler([change.new_val]);
            });
        } catch (e) {
            global._logErr({message: "Deposit Address update error", error: e});
        }
    },

    fetchFees: async function () {
        return await rdb.db('crypto_arb').table('coin_fees').run();
    },

    fetchFeesExchange: async function (exchange, coin) {
        return await rdb.db('crypto_arb').table('coin_fees').filter({id: [exchange, coin]}).run();
    },

    subscribeToFeesUpdates: async function (handler) {
        global._log({message: "<< Subscribe to Fees Updates", type: 'init'});
        try {
            var feed = await rdb.db('crypto_arb').table('coin_fees').changes().run();
            feed.each(function (err, change) {
                handler([change.new_val]);
            });
        } catch (e) {
            global._logErr({message: "Fees update error", error: e});
        }
    },

    saveTrade: async function(trade){
        global._log({message: "Save trade", type: "db"});
        const response = await rdb.db('crypto_arb').table('trades').insert(trade).run();
        return response;
    },

    updateTrade: async function(trade){
        global._log({message: "Update trade", type: "db", details: {tradeId: trade.id}});
        const response = await rdb.db('crypto_arb').table('trades').filter({id: trade.id}).replace(trade).run();
        return response;
    },

    fetchActiveTrades: async function(){
        const trades = await rdb.db('crypto_arb').table('trades').filter({plan: {completed: false}}).run();
        return trades;
    },
    /** END: Main db functions **/


    getCommonTickers: async function (exchange1, exchange2) {
        return await rdb.db('crypto_arb').table('pair_map').getAll(exchange1.name, { index: 'exchange' })("symbol").coerceTo("array").setIntersection(rdb.db('crypto_arb').table('pair_map').getAll(exchange2.name, { index: 'exchange' })("symbol").coerceTo("array")).run();
    },

    getPairMap: async function () {
        const pairMap = await rdb.db('crypto_arb').table('pair_map').run();
        return pairMap;
    },

    getPairMapForExchanges: async function (arrExchanges) {
        const pairMap = await rdb.db('crypto_arb').table('pair_map').getAll(...arrExchanges, { index: 'exchange' }).run();
        return pairMap;
    },

    getPairMapExchange: async function (exchange) {
        const pairMap = await rdb.db('crypto_arb').table('pair_map').filter({ exchange: exchange }).run();
        return pairMap;
    },

    insertPriceData: async function (objectToInsert) {
        await rdb.db('crypto_arb').table('price_data').insert(objectToInsert, { conflict: "replace" }).run();
    },

    insertmock_balances: async function (objectToInsert) {
        await rdb.db('crypto_arb').table('mock_balances').insert(objectToInsert, { conflict: "replace" }).run();
    },

    insertDepositAddress: async function (objectToInsert) {
        await rdb.db('crypto_arb').table('deposit_address').insert(objectToInsert, { conflict: "replace" }).run();
    },

    insertCoinFees: async function (objectToInsert) {
        await rdb.db('crypto_arb').table('coin_fees').insert(objectToInsert, { conflict: "replace" }).run();
    },

    addCoinMap: async function (objectToInsert) {
        await rdb.db('crypto_arb').table('coin_map').insert(objectToInsert, { conflict: "replace" }).run();
    },

    insertPriceDataArchive: async function (objectToInsert) {
        await rdb.db('crypto_arb').table('price_data_archive').insert(objectToInsert, { conflict: "replace" }).run();
    },

    insertCoinMap: async function (objectToInsert) {
        await rdb.db('crypto_arb').table('coin_map').insert(objectToInsert, { conflict: "replace" }).run();
    },

    insertComputedSpread: async function (objectToInsert) {
        await rdb.db('crypto_arb').table('computed_spread').insert(objectToInsert, { conflict: "replace" }).run();
    },

    insertSpreadGraph: async function (objectToInsert) {
        await rdb.db('crypto_arb').table('spread_graph').insert(objectToInsert, { conflict: "replace" }).run();
    },

    getExchangeCanon: async function (ex) {
        return await rdb.db('crypto_arb').table('coin_map').filter({ exchange: ex }).run();
    },

    getPriceArchiveCount: async function (ticker) {
        var count = await rdb.db('crypto_arb').table('price_data_archive').filter({ coinApi_id: ticker }).count().run();
        return count;
    },

    insertPairMap: async function (objectToInsert) {
        await rdb.db('crypto_arb').table('pair_map').insert(objectToInsert, { conflict: "replace" }).run();
    },

    getSpread: async function (exchange1, exchange2, pair) {
        return await rdb.db('crypto_arb').table('price_data_archive').getAll(exchange1.name, exchange2.name, { index: "exchange" }).filter({ symbol: pair }).group('time').ungroup().filter(rdb.row("reduction").contains(function (exchangecq) { return exchangecq("exchange").eq(exchange1.name) }).and(rdb.row("reduction").contains(function (exchangecq) { return exchangecq("exchange").eq(exchange2.name) }))).run();
    },

    getSpreadPriceData: async function (exchange1, exchange2, pair) {
        return await rdb.db('crypto_arb').table('price_data').getAll([pair, exchange1.id], [pair, exchange2.id], { index: "id" })
    },

    getPriceSpread: async function (exchange1, exchange2, pair) {
        let exA = await rdb.db('crypto_arb').table('price_spread').getAll(exchange1.name, exchange2.name, { index: "exchangeA" }).filter({ symbol: pair });
        let exB = await rdb.db('crypto_arb').table('price_spread').getAll(exchange1.name, exchange2.name, { index: "exchangeB" }).filter({ symbol: pair });
        let finArray = Object.values(exA.concat(exB).reduce(function (map, e) {
            map[e.id] = e;
            return map;
        }, {}));

        return Object.values(finArray.reduce(function (map, e) {
            map[e.time] = e;
            return map;
        }, {}));
    },

    addPriceSpread: async function (objectToInsert) {
        await rdb.db('crypto_arb').table('price_spread').insert(objectToInsert, { conflict: "replace" }).run();
    },

    addPriceSpreadArchive: async function (objectToInsert) {
        await rdb.db('crypto_arb').table('price_spread_archive').insert(objectToInsert, { conflict: "replace" }).run();
    },

    addPriceSpreadAnalysisArchive: async function (objectToInsert) {
        await rdb.db('price_archive').table('price_archive').insert(objectToInsert, { conflict: "replace" }).run();
    },

    addSpreadArchiveTable: async function (objectToInsert) {
        await rdb.db('archive').table('spread_archive').insert(objectToInsert, { conflict: "replace" }).run();
    },

    getSpreadArchiveTable: async function (hours) {
        let seconds = hours * 60 * 60;
        const result = rdb.db('archive').table('spread_archive').
            between(rdb.now().sub(seconds), rdb.now(), { index: 'buyExchangeTime' }).run()
        return result
    },

    generateCSV: async function (datum, file) {
        if (datum.length > 0) {
            let headers = Object.keys(datum[0]);
            let h = [];

            for (let index = 0; index < headers.length; index++) {
                const hds = headers[index];
                console.log(hds);
                let e = {};
                e['id'] = hds;
                e['title'] = hds;
                h.push(e);
            }

            const csvWriter = createCsvWriter({
                path: file,
                header: h
            });

            console.log(datum);

            let returner = await csvWriter.writeRecords(datum);
            console.log("WROTE TO CSVV");
            return returner;
        }
    }
};

module.exports = db;