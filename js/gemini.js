'use strict';

//  ---------------------------------------------------------------------------

const Exchange = require('./base/Exchange');
const { ExchangeError } = require('./base/errors');

//  ---------------------------------------------------------------------------

module.exports = class gemini extends Exchange {
    describe() {
        return this.deepExtend(super.describe(), {
            'id': 'gemini',
            'name': 'Gemini',
            'countries': 'US',
            'rateLimit': 1500, // 200 for private API
            'version': 'v1',
            'has': {
                'fetchDepositAddress': true,
                'CORS': false,
                'fetchBidsAsks': false,
                'fetchTickers': false,
                'fetchMyTrades': true,
                'fetchOrder': false,
                'fetchOrders': false,
                'fetchOpenOrders': false,
                'fetchClosedOrders': false,
                'withdraw': true,
            },
            'urls': {
                'logo': 'https://user-images.githubusercontent.com/1294454/27816857-ce7be644-6096-11e7-82d6-3c257263229c.jpg',
                'api': 'https://api.gemini.com',
                'www': 'https://gemini.com',
                'doc': [
                    'https://docs.gemini.com/rest-api',
                    'https://docs.sandbox.gemini.com',
                ],
                'test': 'https://api.sandbox.gemini.com',
                'fees': [
                    'https://gemini.com/fee-schedule/',
                    'https://gemini.com/transfer-fees/',
                ],
            },
            'api': {
                'public': {
                    'get': [
                        'symbols',
                        'pubticker/{symbol}',
                        'book/{symbol}',
                        'trades/{symbol}',
                        'auction/{symbol}',
                        'auction/{symbol}/history',
                    ],
                },
                'private': {
                    'post': [
                        'order/new',
                        'order/cancel',
                        'order/cancel/session',
                        'order/cancel/all',
                        'order/status',
                        'orders',
                        'mytrades',
                        'tradevolume',
                        'balances',
                        'deposit/{currency}/newAddress',
                        'withdraw/{currency}',
                        'heartbeat',
                    ],
                },
            },
            'fees': {
                'trading': {
                    'taker': 0.0025,
                },
            },
        });
    }

    async fetchMarkets() {
        let markets = await this.publicGetSymbols();
        let result = [];
        for (let p = 0; p < markets.length; p++) {
            let id = markets[p];
            let market = id;
            let uppercase = market.toUpperCase();
            let base = uppercase.slice(0, 3);
            let quote = uppercase.slice(3, 6);
            let symbol = base + '/' + quote;
            result.push({
                'id': id,
                'symbol': symbol,
                'base': base,
                'quote': quote,
                'info': market,
            });
        }
        return result;
    }

    async fetchOrderBook(symbol, limit = undefined, params = {}) {
        await this.loadMarkets();
        let orderbook = await this.publicGetBookSymbol(this.extend({
            'symbol': this.marketId(symbol),
        }, params));
        return this.parseOrderBook(orderbook, undefined, 'bids', 'asks', 'price', 'amount');
    }

    async fetchTicker(symbol, params = {}) {
        await this.loadMarkets();
        let market = this.market(symbol);
        let ticker = await this.publicGetPubtickerSymbol(this.extend({
            'symbol': market['id'],
        }, params));
        let timestamp = ticker['volume']['timestamp'];
        let baseVolume = market['base'];
        let quoteVolume = market['quote'];
        return {
            'symbol': symbol,
            'timestamp': timestamp,
            'datetime': this.iso8601(timestamp),
            'high': undefined,
            'low': undefined,
            'bid': parseFloat(ticker['bid']),
            'ask': parseFloat(ticker['ask']),
            'vwap': undefined,
            'open': undefined,
            'close': undefined,
            'first': undefined,
            'last': parseFloat(ticker['last']),
            'change': undefined,
            'percentage': undefined,
            'average': undefined,
            'baseVolume': parseFloat(ticker['volume'][baseVolume]),
            'quoteVolume': parseFloat(ticker['volume'][quoteVolume]),
            'info': ticker,
        };
    }

    parseTrade(trade, market) {
        let timestamp = trade['timestampms'];
        let order = undefined;
        if ('orderId' in trade)
            order = trade['orderId'].toString();
        let fee = this.safeFloat(trade, 'fee_amount');
        if (typeof fee !== 'undefined') {
            let currency = this.safeString(trade, 'fee_currency');
            if (typeof currency !== 'undefined') {
                if (currency in this.currencies_by_id)
                    currency = this.currencies_by_id[currency]['code'];
                currency = this.commonCurrencyCode(currency);
            }
            fee = {
                'cost': parseFloat(trade['fee_amount']),
                'currency': currency,
            };
        }
        let price = parseFloat(trade['price']);
        let amount = parseFloat(trade['amount']);
        return {
            'id': trade['tid'].toString(),
            'order': order,
            'info': trade,
            'timestamp': timestamp,
            'datetime': this.iso8601(timestamp),
            'symbol': market['symbol'],
            'type': undefined,
            'side': trade['type'],
            'price': price,
            'cost': price * amount,
            'amount': amount,
            'fee': fee,
        };
    }

    async fetchTrades(symbol, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets();
        let market = this.market(symbol);
        let response = await this.publicGetTradesSymbol(this.extend({
            'symbol': market['id'],
        }, params));
        return this.parseTrades(response, market, since, limit);
    }

    async fetchDepositAddress(code, params = {}) {
        let response = await this.privatePostDepositCurrencyNewAddress(this.extend({
            'currency': code,
        }, params));
        if (response['address']) {
            let address = this.safeString(response, 'address');
            return {
                'currency': code,
                'address': address,
                'status': 'ok',
                'info': response,
                'tag': null,
            };
        }
        throw new ExchangeError(this.id + ' fetchDepositAddress failed: ' + this.last_http_response);
    }

    async fetchBalance(nativeToCanonCoin, params = {}) {
        await this.loadMarkets();
        let balances = await this.privatePostBalances();
        let result = { 'info': balances };
        for (let b = 0; b < balances.length; b++) {
            let balance = balances[b];
            let currency = balance['currency'];
            let account = {
                'free': parseFloat(balance['available']),
                'used': 0.0,
                'total': parseFloat(balance['amount']),
            };
            account['used'] = account['total'] - account['free'];
            result[currency] = account;
        }
        return this.parseBalance(result);
    }

    async createOrder(symbol, type, side, amount, price = undefined,
        nativeBase, nativeQuote, params = {}) {
        if (type === 'market')
            throw new ExchangeError(this.id + ' allows limit orders only');
        let order = {
            'symbol': symbol,
            'amount': amount.toString(),
            'price': price.toString(),
            'side': side,
            'type': 'exchange limit', // gemini allows limit orders only
        };
        const response = await this.privatePostOrderNew(this.extend(order, params));
        if (this.isObject(response) && 'order_id' in response) {
            return this.returnSuccessCreateOrder(response['order_id'], response)
        } else {
            return { success: false, error: response }
        }
    }

    async fetchOrder(order_id, symbol, side, params = {}) {
        let ord = {
            'order_id': order_id,
        };
        const order = await this.privatePostOrderStatus(this.extend(ord, params));
        if(this.isObject(order) && 'order_id' in order){
            let status = 'open'
            if (!order['is_live']) {
                status = 'closed'
            }
            if(order['is_cancelled']){
                status = 'canceled'
            }
            return this.returnSuccessFetchOrder(order['order_id'], status, order['executed_amount'], 
                order['original_amount'],order)
        } else {
            return {success: false, error: order}
        }
    }

    async cancelOrder(id, symbol = undefined, side, params = {}) {
        const returner = await this.privatePostOrderCancel({ 'order_id': id });
        if (this.isObject(returner) && 'is_cancelled' in returner && returner.is_cancelled) {
            return { success: true, info: returner }
        }
        return { success: false, error: returner }
    }

    async fetchMyTrades(symbol = undefined, since = undefined, limit = undefined, params = {}) {
        if (typeof symbol === 'undefined')
            throw new ExchangeError(this.id + ' fetchMyTrades requires a symbol argument');
        await this.loadMarkets();
        let market = this.market(symbol);
        let request = {
            'symbol': market['id'],
        };
        if (typeof limit !== 'undefined')
            request['limit'] = limit;
        let response = await this.privatePostMytrades(this.extend(request, params));
        return this.parseTrades(response, market, since, limit);
    }

    async withdraw(code, amount, address, tag = undefined, params = {}) {
        this.checkAddress(address);
        let response = await this.privatePostWithdrawCurrency(this.extend({
            'currency': code,
            'amount': amount,
            'address': address,
        }, params));
        if(this.isObject(response) && 'txHash' in response){
            this.returnSuccessWithdraw(response, this.safeString(response, 'txHash'))
        }
        return this.returnFailureWithdraw(response)
    }

    sign(path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        let url = '/' + this.version + '/' + this.implodeParams(path, params);
        let query = this.omit(params, this.extractParams(path));
        if (api === 'public') {
            if (Object.keys(query).length)
                url += '?' + this.urlencode(query);
        } else {
            this.checkRequiredCredentials();
            let nonce = this.nonce();
            let request = this.extend({
                'request': url,
                'nonce': nonce,
            }, query);
            let payload = this.json(request);
            payload = this.stringToBase64(this.encode(payload));
            let signature = this.hmac(payload, this.encode(this.secret), 'sha384');
            headers = {
                'Content-Type': 'text/plain',
                'X-GEMINI-APIKEY': this.apiKey,
                'X-GEMINI-PAYLOAD': this.decode(payload),
                'X-GEMINI-SIGNATURE': signature,
            };
        }
        url = this.urls['api'] + url;
        return { 'url': url, 'method': method, 'body': body, 'headers': headers };
    }

    async request(path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        let response = await this.fetch2(path, api, method, params, headers, body);
        if ('result' in response)
            if (response['result'] === 'error')
                throw new ExchangeError(this.id + ' ' + this.json(response));
        return response;
    }
};