'use strict';

//  ---------------------------------------------------------------------------

const Exchange = require('./base/Exchange');
const { ExchangeError, AuthenticationError, InvalidOrder, InsufficientFunds, OrderNotFound, DDoSProtection } = require('./base/errors');

//  ---------------------------------------------------------------------------

module.exports = class bittrex extends Exchange {
    describe() {
        return this.deepExtend(super.describe(), {
            'id': 'bittrex',
            'name': 'Bittrex',
            'countries': 'US',
            'version': 'v1.1',
            'rateLimit': 1500,
            'hasAlreadyAuthenticatedSuccessfully': false, // a workaround for APIKEY_INVALID
            // new metainfo interface
            'has': {
                'getCoinFees': true,
                'CORS': true,
                'createMarketOrder': false,
                'fetchDepositAddress': true,
                'fetchClosedOrders': 'emulated',
                'fetchCurrencies': true,
                'fetchMyTrades': false,
                'fetchOHLCV': true,
                'fetchOrder': true,
                'fetchOrders': true,
                'fetchOpenOrders': true,
                'fetchTickers': true,
                'withdraw': true,
            },
            'timeframes': {
                '1m': 'oneMin',
                '5m': 'fiveMin',
                '30m': 'thirtyMin',
                '1h': 'hour',
                '1d': 'day',
            },
            'urls': {
                'logo': 'https://user-images.githubusercontent.com/1294454/27766352-cf0b3c26-5ed5-11e7-82b7-f3826b7a97d8.jpg',
                'api': {
                    'public': 'https://bittrex.com/api',
                    'account': 'https://bittrex.com/api',
                    'market': 'https://bittrex.com/api',
                    'v2': 'https://bittrex.com/api/v2.0/pub',
                },
                'www': 'https://bittrex.com',
                'doc': [
                    'https://bittrex.com/Home/Api',
                    'https://www.npmjs.org/package/node.bittrex.api',
                ],
                'fees': [
                    'https://bittrex.com/Fees',
                    'https://support.bittrex.com/hc/en-us/articles/115000199651-What-fees-does-Bittrex-charge-',
                ],
            },
            'api': {
                'v2': {
                    'get': [
                        'currencies/GetBTCPrice',
                        'market/GetTicks',
                        'market/GetLatestTick',
                        'Markets/GetMarketSummaries',
                        'market/GetLatestTick',
                    ],
                    'post': [
                        'Currency/GetCurrencyInfo',
                    ],
                },
                'public': {
                    'get': [
                        'currencies',
                        'markethistory',
                        'markets',
                        'marketsummaries',
                        'marketsummary',
                        'orderbook',
                        'ticker',
                    ],
                },
                'account': {
                    'get': [
                        'balance',
                        'balances',
                        'depositaddress',
                        'deposithistory',
                        'order',
                        'orderhistory',
                        'withdrawalhistory',
                        'withdraw',
                    ],
                },
                'market': {
                    'get': [
                        'buylimit',
                        'buymarket',
                        'cancel',
                        'openorders',
                        'selllimit',
                        'sellmarket',
                    ],
                },
            },
            'fees': {
                'trading': {
                    'tierBased': false,
                    'percentage': true,
                    'maker': 0.0025,
                    'taker': 0.0025,
                },
                'funding': {
                    'tierBased': false,
                    'percentage': false,
                    'withdraw': {
                        'BTC': 0.001,
                        'LTC': 0.01,
                        'DOGE': 2,
                        'VTC': 0.02,
                        'PPC': 0.02,
                        'FTC': 0.2,
                        'RDD': 2,
                        'NXT': 2,
                        'DASH': 0.002,
                        'POT': 0.002,
                    },
                    'deposit': {
                        'BTC': 0,
                        'LTC': 0,
                        'DOGE': 0,
                        'VTC': 0,
                        'PPC': 0,
                        'FTC': 0,
                        'RDD': 0,
                        'NXT': 0,
                        'DASH': 0,
                        'POT': 0,
                    },
                },
            },
            'exceptions': {
                'APISIGN_NOT_PROVIDED': AuthenticationError,
                'INVALID_SIGNATURE': AuthenticationError,
                'INVALID_CURRENCY': ExchangeError,
                'INVALID_PERMISSION': AuthenticationError,
                'INSUFFICIENT_FUNDS': InsufficientFunds,
                'QUANTITY_NOT_PROVIDED': InvalidOrder,
                'MIN_TRADE_REQUIREMENT_NOT_MET': InvalidOrder,
                'ORDER_NOT_OPEN': InvalidOrder,
                'UUID_INVALID': OrderNotFound,
                'RATE_NOT_PROVIDED': InvalidOrder, // createLimitBuyOrder ('ETH/BTC', 1, 0)
            },
        });
    }

    costToPrecision(symbol, cost) {
        return this.truncate(parseFloat(cost), this.markets[symbol]['precision']['price']);
    }

    feeToPrecision(symbol, fee) {
        return this.truncate(parseFloat(fee), this.markets[symbol]['precision']['price']);
    }

    async getCoinFees(code, params = {}) {
        const response = await this.v2PostCurrencyGetCurrencyInfo(this.extend({
            'currencyName': code,
        }, params));
        if (typeof response.result !== 'undefined') {
            const result = response.result;
            const withdrawalFee = Number(result['TxFee']);
            const minimumWithdraw = 3.00001 * withdrawalFee;
            const withdrawEnabled = result['IsActive'];
            let depositEnabled = withdrawEnabled
            return {
                'symbol': code,
                'minimumWithdraw': Number(minimumWithdraw),
                'withdrawEnabled': withdrawEnabled,
                'withdrawalFee': Number(withdrawalFee),
                'depositEnabled': depositEnabled,
                'depositFee': Number(0),
            };
        } else {
            throw new ExchangeError(this.id + ' GetCoinFees failed: No Transaction fee in response');
        }
        throw new ExchangeError(this.id + ' fetchCoinFees failed: ' + this.last_http_response + this.id);
    }

    async fetchMarkets() {
        let response = await this.v2GetMarketsGetMarketSummaries();
        let result = [];
        for (let i = 0; i < response['result'].length; i++) {
            let market = response['result'][i]['Market'];
            let id = market['MarketName'];
            let baseId = market['MarketCurrency'];
            let quoteId = market['BaseCurrency'];
            let base = this.commonCurrencyCode(baseId);
            let quote = this.commonCurrencyCode(quoteId);
            let symbol = base + '/' + quote;
            let precision = {
                'amount': 8,
                'price': 8,
            };
            let active = market['IsActive'];
            result.push({
                'id': id,
                'symbol': symbol,
                'base': base,
                'quote': quote,
                'baseId': baseId,
                'quoteId': quoteId,
                'active': active,
                'info': market,
                'precision': precision,
                'limits': {
                    'amount': {
                        'min': market['MinTradeSize'],
                        'max': undefined,
                    },
                    'price': {
                        'min': Math.pow(10, -precision['price']),
                        'max': undefined,
                    },
                },
            });
        }
        return result;
    }

    async fetchBalance(nativeToCanonCoin, params = {}) {
        await this.loadMarkets();
        let response = await this.accountGetBalances(params);
        let balances = response['result'];
        let result = { 'info': balances };
        let indexed = this.indexBy(balances, 'Currency');
        let keys = Object.keys(indexed);
        for (let i = 0; i < keys.length; i++) {
            let id = keys[i];
            let currency = nativeToCanonCoin.get(id);
            if (currency) {
                let account = this.account();
                let balance = indexed[id];
                let free = parseFloat(balance['Available']);
                let total = parseFloat(balance['Balance']);
                let used = total - free;
                account['free'] = free;
                account['used'] = used;
                account['total'] = total;
                result[currency] = account;
            }
        }
        return this.parseBalance(result);
    }

    async fetchOrderBook(symbol, limit = undefined, params = {}) {
        await this.loadMarkets();
        let response = await this.publicGetOrderbook(this.extend({
            'market': this.marketId(symbol),
            'type': 'both',
        }, params));
        let orderbook = response['result'];
        if ('type' in params) {
            if (params['type'] === 'buy') {
                orderbook = {
                    'buy': response['result'],
                    'sell': [],
                };
            } else if (params['type'] === 'sell') {
                orderbook = {
                    'buy': [],
                    'sell': response['result'],
                };
            }
        }
        return this.parseOrderBook(orderbook, undefined, 'buy', 'sell', 'Rate', 'Quantity');
    }

    parseTicker(ticker, market = undefined) {
        let timestamp = this.safeString(ticker, 'TimeStamp');
        let iso8601 = undefined;
        if (typeof timestamp === 'string') {
            if (timestamp.length > 0) {
                timestamp = this.parse8601(timestamp);
                iso8601 = this.iso8601(timestamp);
            }
        }
        let symbol = undefined;
        if (market)
            symbol = market['symbol'];
        let previous = this.safeFloat(ticker, 'PrevDay');
        let last = this.safeFloat(ticker, 'Last');
        let change = undefined;
        let percentage = undefined;
        if (typeof last !== 'undefined')
            if (typeof previous !== 'undefined') {
                change = last - previous;
                if (previous > 0)
                    percentage = (change / previous) * 100;
            }
        return {
            'symbol': symbol,
            'timestamp': timestamp,
            'datetime': iso8601,
            'high': this.safeFloat(ticker, 'High'),
            'low': this.safeFloat(ticker, 'Low'),
            'bid': this.safeFloat(ticker, 'Bid'),
            'ask': this.safeFloat(ticker, 'Ask'),
            'vwap': undefined,
            'open': undefined,
            'close': undefined,
            'first': undefined,
            'last': last,
            'change': change,
            'percentage': percentage,
            'average': undefined,
            'baseVolume': this.safeFloat(ticker, 'Volume'),
            'quoteVolume': this.safeFloat(ticker, 'BaseVolume'),
            'info': ticker,
        };
    }

    async fetchCurrencies(params = {}) {
        let response = await this.publicGetCurrencies(params);
        let currencies = response['result'];
        let result = {};
        for (let i = 0; i < currencies.length; i++) {
            let currency = currencies[i];
            let id = currency['Currency'];
            // todo: will need to rethink the fees
            // to add support for multiple withdrawal/deposit methods and
            // differentiated fees for each particular method
            let code = this.commonCurrencyCode(id);
            let precision = 8; // default precision, todo: fix "magic constants"
            let address = this.safeValue(currency, 'BaseAddress');
            result[code] = {
                'id': id,
                'code': code,
                'address': address,
                'info': currency,
                'type': currency['CoinType'],
                'name': currency['CurrencyLong'],
                'active': currency['IsActive'],
                'status': 'ok',
                'fee': currency['TxFee'], // todo: redesign
                'precision': precision,
                'limits': {
                    'amount': {
                        'min': Math.pow(10, -precision),
                        'max': Math.pow(10, precision),
                    },
                    'price': {
                        'min': Math.pow(10, -precision),
                        'max': Math.pow(10, precision),
                    },
                    'cost': {
                        'min': undefined,
                        'max': undefined,
                    },
                    'withdraw': {
                        'min': currency['TxFee'],
                        'max': Math.pow(10, precision),
                    },
                },
            };
        }
        return result;
    }

    async fetchTickers(symbols = undefined, params = {}) {
        await this.loadMarkets();
        let response = await this.publicGetMarketsummaries(params);
        let tickers = response['result'];
        let result = {};
        for (let t = 0; t < tickers.length; t++) {
            let ticker = tickers[t];
            let id = ticker['MarketName'];
            let market = undefined;
            let symbol = id;
            if (id in this.markets_by_id) {
                market = this.markets_by_id[id];
                symbol = market['symbol'];
            } else {
                symbol = this.parseSymbol(id);
            }
            result[symbol] = this.parseTicker(ticker, market);
        }
        return result;
    }

    async fetchTicker(symbol, params = {}) {
        await this.loadMarkets();
        let market = this.market(symbol);
        let response = await this.publicGetMarketsummary(this.extend({
            'market': market['id'],
        }, params));
        let ticker = response['result'][0];
        return this.parseTicker(ticker, market);
    }

    parseTrade(trade, market = undefined) {
        let timestamp = this.parse8601(trade['TimeStamp'] + '+00:00');
        let side = undefined;
        if (trade['OrderType'] === 'BUY') {
            side = 'buy';
        } else if (trade['OrderType'] === 'SELL') {
            side = 'sell';
        }
        let id = undefined;
        if ('Id' in trade)
            id = trade['Id'].toString();
        return {
            'id': id,
            'info': trade,
            'timestamp': timestamp,
            'datetime': this.iso8601(timestamp),
            'symbol': market['symbol'],
            'type': 'limit',
            'side': side,
            'price': parseFloat(trade['Price']),
            'amount': parseFloat(trade['Quantity']),
        };
    }

    async fetchTrades(symbol, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets();
        let market = this.market(symbol);
        let response = await this.publicGetMarkethistory(this.extend({
            'market': market['id'],
        }, params));
        if ('result' in response) {
            if (typeof response['result'] !== 'undefined')
                return this.parseTrades(response['result'], market, since, limit);
        }
        throw new ExchangeError(this.id + ' fetchTrades() returned undefined response');
    }

    parseOHLCV(ohlcv, market = undefined, timeframe = '1d', since = undefined, limit = undefined) {
        let timestamp = this.parse8601(ohlcv['T'] + '+00:00');
        return [
            timestamp,
            ohlcv['O'],
            ohlcv['H'],
            ohlcv['L'],
            ohlcv['C'],
            ohlcv['V'],
        ];
    }

    async fetchOHLCV(symbol, timeframe = '1m', since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets();
        let market = this.market(symbol);
        let request = {
            'tickInterval': this.timeframes[timeframe],
            'marketName': market['id'],
        };
        let response = await this.v2GetMarketGetTicks(this.extend(request, params));
        if ('result' in response) {
            if (response['result'])
                return this.parseOHLCVs(response['result'], market, timeframe, since, limit);
        }
        throw new ExchangeError(this.id + ' returned an empty or unrecognized response: ' + this.json(response));
    }

    async fetchOpenOrders(symbol = undefined, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets();
        let request = {};
        let market = undefined;
        if (symbol) {
            market = this.market(symbol);
            request['market'] = market['id'];
        }
        let response = await this.marketGetOpenorders(this.extend(request, params));
        let orders = this.parseOrders(response['result'], market, since, limit);
        return this.filterBySymbol(orders, symbol);
    }

    async createOrder(symbol, type, side, amount, price = undefined,
        nativeBase, nativeQuote, params = {}) {
        if (type !== 'limit')
            throw new ExchangeError(this.id + ' allows limit orders only');
        let method = 'marketGet' + this.capitalize(side) + type;

        const market = this.marketsById[symbol]
        if(!this.isObject(market)){
            throw new ExchangeError (symbol + ' could not find a valid market');
        }

        let order = {
            'market': symbol,
            'quantity': Number(this.amountToPrecision (market.symbol, amount)),
            'rate': Number(this.priceToPrecision (market.symbol, price)),
        };

        let response = await this[method](this.extend(order, params));
        let orderIdField = this.getOrderIdField();
        if (this.isObject(response) && "result" in response && orderIdField in response.result
            && response['result'][orderIdField].length > 0) {
            return this.returnSuccessCreateOrder(response['result'][orderIdField], response)
        }
        return this.returnFailureCreateOrder(response)
    }

    getOrderIdField() {
        return 'uuid';
    }

    async cancelOrder(id, symbol = undefined, side, params = {}) {
        let orderIdField = this.getOrderIdField();
        let request = {};
        request[orderIdField] = id;
        let response = await this.marketGetCancel(this.extend(request, params));
        if (this.isObject(response) && ("success" in response) && response.success) {
            return { success: true, info: response }
        } else {
            throw new ExchangeError(id + ' cancelling order failed: ' + response);
        }
    }

    parseSymbol(id) {
        let [quote, base] = id.split('-');
        base = this.commonCurrencyCode(base);
        quote = this.commonCurrencyCode(quote);
        return base + '/' + quote;
    }

    parseOrder(order) {
        let status = 'open';
        if (('Closed' in order) && order['Closed'])
            status = 'closed';
        if (('CancelInitiated' in order) && order['CancelInitiated'])
            status = 'canceled';

        let amount = this.safeFloat(order, 'Quantity');
        let remaining = this.safeFloat(order, 'QuantityRemaining', 0.0);
        let filled = amount - remaining;

        let id = this.safeString(order, 'OrderUuid');
        if (typeof id === 'undefined')
            id = this.safeString(order, 'OrderId');

        return this.returnSuccessFetchOrder(id, status, filled, amount, order)
    }

    async fetchOrder(id, symbol = undefined, side, params = {}) {
        let response = undefined;
        try {
            let orderIdField = this.getOrderIdField();
            let request = {};
            request[orderIdField] = id;
            response = await this.accountGetOrder(this.extend(request, params));
        } catch (e) {
            if (this.last_json_response) {
                let message = this.safeString(this.last_json_response, 'message');
                if (message === 'UUID_INVALID')
                    throw new OrderNotFound(this.id + ' fetchOrder() error: ' + this.last_http_response);
            }
            throw e;
        }
        if(!this.isObject(response) || !('result' in response)){
            throw new OrderNotFound(this.id + ' fetchOrder() error: ' + response);
        }
        return this.parseOrder(response['result']);
    }

    async fetchOrders(symbol = undefined, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets();
        let request = {};
        let market = undefined;
        if (symbol) {
            market = this.market(symbol);
            request['market'] = market['id'];
        }
        let response = await this.accountGetOrderhistory(this.extend(request, params));
        let orders = this.parseOrders(response['result'], market, since, limit);
        if (symbol)
            return this.filterBySymbol(orders, symbol);
        return orders;
    }

    async fetchClosedOrders(symbol = undefined, since = undefined, limit = undefined, params = {}) {
        let orders = await this.fetchOrders(symbol, since, limit, params);
        return this.filterBy(orders, 'status', 'closed');
    }

    currencyId(currency) {
        if (currency === 'BCH')
            return 'BCC';
        return currency;
    }

    async fetchDepositAddress(code, params = {}) {
        let response = await this.accountGetDepositaddress(this.extend({
            'currency': code,
        }, params));

        let res = await this.publicGetCurrencies({});
        let allCurrencies = res['result'];
        let baseAddress;
        for (let i = 0; i < allCurrencies.length; i++) {
            let cid = allCurrencies[i]['Currency'];
            if (code === cid) {
                baseAddress = this.safeString(allCurrencies[i], 'BaseAddress');
            }
        }
        let address = this.safeString(response['result'], 'Address');
        let message = this.safeString(response, 'message');

        let status = 'ok';
        if (!address || message === 'ADDRESS_GENERATING')
            status = 'pending';
        let tag = undefined;
        if ((code === 'XRP') || (code === 'XLM')) {
            tag = address;
            address = currency['address'];
        }
        this.checkAddress(address);
        return {
            'currency': code,
            'address': address,
            'tag': tag,
            'status': status,
            'info': response,
        };
    }

    async withdraw (currency, amount, address, tag = undefined, params = {}) {
        this.checkAddress(address);
        let request = {
            'currency': currency,
            'quantity': amount,
            'address': address,
        };
        if (tag)
            request['paymentid'] = tag;
        let response = await this.accountGetWithdraw(this.extend(request, params));

        if ('result' in response && 'success' in response && !response['success']) {
            throw new Error("Withdraw was unsuccessful " + ' ' + JSON.stringify(response));
        }

        if (this.isObject(response) && 'result' in response && 'uuid' in response['result']) {
            const id = response['result']['uuid'];
            return this.returnSuccessWithdraw(response, id)
        } else {
            return this.returnFailureWithdraw(response)
        }
    }

    sign(path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        let url = this.urls['api'][api] + '/';
        if (api !== 'v2')
            url += this.version + '/';
        if (api === 'public') {
            url += api + '/' + method.toLowerCase() + path;
            if (Object.keys(params).length)
                url += '?' + this.urlencode(params);
        } else if (api === 'v2') {
            url += path;
            if (Object.keys(params).length)
                url += '?' + this.urlencode(params);
        } else {
            this.checkRequiredCredentials();
            let nonce = this.nonce();
            url += api + '/';
            if (((api === 'account') && (path !== 'withdraw')) || (path === 'openorders'))
                url += method.toLowerCase();
            url += path + '?' + this.urlencode(this.extend({
                'nonce': nonce,
                'apikey': this.apiKey,
            }, params));
            let signature = this.hmac(this.encode(url), this.encode(this.secret), 'sha512');
            headers = { 'apisign': signature };
        }
        return { 'url': url, 'method': method, 'body': body, 'headers': headers };
    }

    handleErrors(code, reason, url, method, headers, body) {
        if (body[0] === '{') {
            let response = JSON.parse(body);
            // { success: false, message: "message" }
            let success = this.safeValue(response, 'success');
            if (typeof success === 'undefined')
                throw new ExchangeError(this.id + ': malformed response: ' + this.json(response));
            if (typeof success === 'string')
                // bleutrade uses string instead of boolean
                success = (success === 'true') ? true : false;
            if (!success) {
                const message = this.safeString(response, 'message');
                const feedback = this.id + ' ' + this.json(response);
                const exceptions = this.exceptions;
                if (message in exceptions)
                    throw new exceptions[message](feedback);
                if (message === 'APIKEY_INVALID') {
                    if (this.hasAlreadyAuthenticatedSuccessfully) {
                        throw new DDoSProtection(feedback);
                    } else {
                        throw new AuthenticationError(feedback);
                    }
                }
                if (message === 'DUST_TRADE_DISALLOWED_MIN_VALUE_50K_SAT')
                    throw new InvalidOrder(this.id + ' order cost should be over 50k satoshi ' + this.json(response));
                throw new ExchangeError(this.id + ' ' + this.json(response));
            }
        }
    }

    async request(path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        let response = await this.fetch2(path, api, method, params, headers, body);
        // a workaround for APIKEY_INVALID
        if ((api === 'account') || (api === 'market'))
            this.hasAlreadyAuthenticatedSuccessfully = true;
        return response;
    }
};