'use strict';

//  ---------------------------------------------------------------------------

const Exchange = require ('./base/Exchange');
const { ExchangeError } = require ('./base/errors');

//  ---------------------------------------------------------------------------

module.exports = class huobipro extends Exchange {
    describe () {
        return this.deepExtend (super.describe (), {
            'id': 'huobipro',
            'name': 'Huobi Pro',
            'countries': 'CN',
            'rateLimit': 2000,
            'userAgent': this.userAgents['chrome39'],
            'version': 'v1',
            'accounts': undefined,
            'accountsById': undefined,
            'hostname': 'api.huobi.pro',
            'has': {
                'getCoinFees': true,
                'CORS': false,
                'fetchOHCLV': true,
                'fetchOrders': true,
                'fetchOrder': true,
                'fetchOpenOrders': true,
                'fetchDepositAddress': true,
                'withdraw': true,
                'fetchDepositAddress':true,
            },
            'timeframes': {
                '1m': '1min',
                '5m': '5min',
                '15m': '15min',
                '30m': '30min',
                '1h': '60min',
                '1d': '1day',
                '1w': '1week',
                '1M': '1mon',
                '1y': '1year',
            },
            'urls': {
                'logo': 'https://user-images.githubusercontent.com/1294454/27766569-15aa7b9a-5edd-11e7-9e7f-44791f4ee49c.jpg',
                'api': 'https://api.huobi.pro',
                'www': 'https://www.huobipro.com',
                'doc': 'https://github.com/huobiapi/API_Docs/wiki/REST_api_reference',
                'fees': 'https://www.huobipro.com/about/fee/',
            },
            'api': {
                'market': {
                    'get': [
                        'history/kline', // 获取K线数据
                        'detail/merged', // 获取聚合行情(Ticker)
                        'depth', // 获取 Market Depth 数据
                        'trade', // 获取 Trade Detail 数据
                        'history/trade', // 批量获取最近的交易记录
                        'detail', // 获取 Market Detail 24小时成交量数据
                    ],
                },
                'public': {
                    'get': [
                        'common/symbols', // 查询系统支持的所有交易对
                        'common/currencys', // 查询系统支持的所有币种
                        'settings/currencys',
                        'common/timestamp', // 查询系统当前时间
                    ],
                },
                'private': {
                    'get': [
                        'account/accounts', // 查询当前用户的所有账户(即account-id)
                        'account/accounts/{id}/balance', // 查询指定账户的余额
                        'order/orders/{id}', // 查询某个订单详情
                        'order/orders/{id}/matchresults', // 查询某个订单的成交明细
                        'order/orders', // 查询当前委托、历史委托
                        'order/matchresults', // 查询当前成交、历史成交
                        'dw/withdraw-virtual/addresses', // 查询虚拟币提现地址
                        'dw/deposit-virtual/addresses',
                        'dw/deposit-virtual/sharedAddressWithTag',
                        'dw/withdraw-virtual/fee',
                    ],
                    'post': [
                        'order/orders/place', // 创建并执行一个新订单 (一步下单， 推荐使用)
                        'order/orders', // 创建一个新的订单请求 （仅创建订单，不执行下单）
                        'order/orders/{id}/place', // 执行一个订单 （仅执行已创建的订单）
                        'order/orders/{id}/submitcancel', // 申请撤销一个订单请求
                        'order/orders/batchcancel', // 批量撤销订单
                        'dw/balance/transfer', // 资产划转
                        'dw/withdraw/api/create', // 申请提现虚拟币
                        'dw/withdraw-virtual/create', // 申请提现虚拟币
                        'dw/withdraw-virtual/{id}/place', // 确认申请虚拟币提现
                        'dw/withdraw-virtual/{id}/cancel', // 申请取消提现虚拟币
                    ],
                },
            },
            'fees': {
                'trading': {
                    'tierBased': false,
                    'percentage': true,
                    'maker': 0.002,
                    'taker': 0.002,
                },
            },
        });
    }

    async getCoinFees (code, params = {}) {
        let request = {
            'currency': code.toLowerCase(),
        };
        let requestMap = {
            'language': 'en-US',
        };

        let response = await this.privateGetDwWithdrawVirtualFee (this.extend (request, params));
        let responseMap = await this.publicGetSettingsCurrencys (this.extend (requestMap, params));
        let coinData;
        if (responseMap.data){
            for (let z = 0; z < responseMap.data.length; z++) {
                const coin = responseMap.data[z];
                if(code.toLowerCase() === coin.name){
                    coinData = coin;
                    break;
                }              
            }
        }

        if (coinData.name && response) {
            const minimumWithdraw = coinData['withdraw-min-amount'];
            const withdrawEnabled = coinData['withdraw-enabled'];
            const depositEnabled = coinData['deposit-enabled'];
            let withdrawalFee = response['data'];
            return {
                'symbol': code,
                'minimumWithdraw': Number(minimumWithdraw),
                'withdrawEnabled': withdrawEnabled,
                'withdrawalFee': Number(withdrawalFee),
                'depositEnabled': depositEnabled,
                'depositFee': Number(0)
            };
        } else {
            throw new ExchangeError (this.id + ' GetCoinFees failed: No Transaction fee in response');
        }
        throw new ExchangeError (this.id + ' GetCoinFees failed: ' + this.last_http_response + this.id);
    }

    async fetchMarkets () {
        let response = await this.publicGetCommonSymbols ();
        let markets = response['data'];
        let numMarkets = markets.length;
        if (numMarkets < 1)
            throw new ExchangeError (this.id + ' publicGetCommonSymbols returned empty response: ' + this.json (response));
        let result = [];
        for (let i = 0; i < markets.length; i++) {
            let market = markets[i];
            let baseId = market['base-currency'];
            let quoteId = market['quote-currency'];
            let base = baseId.toUpperCase ();
            let quote = quoteId.toUpperCase ();
            let id = baseId + quoteId;
            base = this.commonCurrencyCode (base);
            quote = this.commonCurrencyCode (quote);
            let symbol = base + '/' + quote;
            let precision = {
                'amount': market['amount-precision'],
                'price': market['price-precision'],
            };
            let lot = Math.pow (10, -precision['amount']);
            let maker = (base === 'OMG') ? 0 : 0.2 / 100;
            let taker = (base === 'OMG') ? 0 : 0.2 / 100;
            result.push ({
                'id': id,
                'symbol': symbol,
                'base': base,
                'quote': quote,
                'lot': lot,
                'precision': precision,
                'taker': taker,
                'maker': maker,
                'limits': {
                    'amount': {
                        'min': lot,
                        'max': Math.pow (10, precision['amount']),
                    },
                    'price': {
                        'min': Math.pow (10, -precision['price']),
                        'max': undefined,
                    },
                    'cost': {
                        'min': 0,
                        'max': undefined,
                    },
                },
                'info': market,
            });
        }
        return result;
    }

    parseTicker (ticker, market = undefined) {
        let symbol = undefined;
        if (market)
            symbol = market['symbol'];
        let timestamp = this.milliseconds ();
        if ('ts' in ticker)
            timestamp = ticker['ts'];
        let bid = undefined;
        let ask = undefined;
        let bidVolume = undefined;
        let askVolume = undefined;
        if ('bid' in ticker) {
            if (Array.isArray (ticker['bid'])) {
                bid = this.safeFloat (ticker['bid'], 0);
                bidVolume = this.safeFloat (ticker['bid'], 1);
            }
        }
        if ('ask' in ticker) {
            if (Array.isArray (ticker['ask'])) {
                ask = this.safeFloat (ticker['ask'], 0);
                askVolume = this.safeFloat (ticker['ask'], 1);
            }
        }
        let open = this.safeFloat (ticker, 'open');
        let close = this.safeFloat (ticker, 'close');
        let change = undefined;
        let percentage = undefined;
        let average = undefined;
        if ((typeof open !== 'undefined') && (typeof close !== 'undefined')) {
            change = close - open;
            average = this.sum (open, close) / 2;
            if ((typeof close !== 'undefined') && (close > 0))
                percentage = (change / open) * 100;
        }
        let baseVolume = this.safeFloat (ticker, 'amount');
        let quoteVolume = this.safeFloat (ticker, 'vol');
        let vwap = undefined;
        if (typeof baseVolume !== 'undefined' && typeof quoteVolume !== 'undefined' && baseVolume > 0)
            vwap = quoteVolume / baseVolume;
        return {
            'symbol': symbol,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'high': ticker['high'],
            'low': ticker['low'],
            'bid': bid,
            'bidVolume': bidVolume,
            'ask': ask,
            'askVolume': askVolume,
            'vwap': vwap,
            'open': open,
            'close': close,
            'last': close,
            'change': change,
            'percentage': percentage,
            'average': average,
            'baseVolume': baseVolume,
            'quoteVolume': quoteVolume,
            'info': ticker,
        };
    }

    async fetchOrderBook (symbol, limit = undefined, params = {}) {
        await this.loadMarkets ();
        let market = this.market (symbol);
        let response = await this.marketGetDepth (this.extend ({
            'symbol': market['id'],
            'type': 'step0',
        }, params));
        if ('tick' in response) {
            if (!response['tick']) {
                throw new ExchangeError (this.id + ' fetchOrderBook() returned empty response: ' + this.json (response));
            }
            return this.parseOrderBook (response['tick'], response['tick']['ts']);
        }
        throw new ExchangeError (this.id + ' fetchOrderBook() returned unrecognized response: ' + this.json (response));
    }

    async fetchTicker (symbol, params = {}) {
        await this.loadMarkets ();
        let market = this.market (symbol);
        let response = await this.marketGetDetailMerged (this.extend ({
            'symbol': market['id'],
        }, params));
        return this.parseTicker (response['tick'], market);
    }

    parseTrade (trade, market) {
        let timestamp = trade['ts'];
        return {
            'info': trade,
            'id': trade['id'].toString (),
            'order': undefined,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'symbol': market['symbol'],
            'type': undefined,
            'side': trade['direction'],
            'price': trade['price'],
            'amount': trade['amount'],
        };
    }

    async fetchTrades (symbol, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        let market = this.market (symbol);
        let response = await this.marketGetHistoryTrade (this.extend ({
            'symbol': market['id'],
            'size': 2000,
        }, params));
        let data = response['data'];
        let result = [];
        for (let i = 0; i < data.length; i++) {
            let trades = data[i]['data'];
            for (let j = 0; j < trades.length; j++) {
                let trade = this.parseTrade (trades[j], market);
                result.push (trade);
            }
        }
        result = this.sortBy (result, 'timestamp');
        return this.filterBySymbolSinceLimit (result, symbol, since, limit);
    }

    parseOHLCV (ohlcv, market = undefined, timeframe = '1m', since = undefined, limit = undefined) {
        return [
            ohlcv['id'] * 1000,
            ohlcv['open'],
            ohlcv['high'],
            ohlcv['low'],
            ohlcv['close'],
            ohlcv['amount'],
        ];
    }

    async fetchOHLCV (symbol, timeframe = '1m', since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        let market = this.market (symbol);
        let response = await this.marketGetHistoryKline (this.extend ({
            'symbol': market['id'],
            'period': this.timeframes[timeframe],
            'size': 2000, // max = 2000
        }, params));
        return this.parseOHLCVs (response['data'], market, timeframe, since, limit);
    }

    async loadAccounts (reload = false) {
        if (reload) {
            this.accounts = await this.fetchAccounts ();
        } else {
            if (this.accounts) {
                return this.accounts;
            } else {
                this.accounts = await this.fetchAccounts ();
                this.accountsById = this.indexBy (this.accounts, 'id');
            }
        }
        return this.accounts;
    }

    async fetchAccounts () {
        await this.loadMarkets ();
        let response = await this.privateGetAccountAccounts ();
        return response['data'];
    }

    async fetchBalance (nativeToCanonCoin, params = {}) {
        await this.loadMarkets ();
        await this.loadAccounts ();
        let response = await this.privateGetAccountAccountsIdBalance (this.extend ({
            'id': this.accounts[0]['id'],
        }, params));
        let balances = response['data']['list'];
        let result = { 'info': response };
        for (let i = 0; i < balances.length; i++) {
            let balance = balances[i];
            let uppercase = balance['currency'].toUpperCase ();
            let currency = nativeToCanonCoin.get (uppercase);
            if (currency){
                let account = undefined;
                if (currency in result)
                    account = result[currency];
                else
                    account = this.account ();
                if (balance['type'] === 'trade')
                    account['free'] = parseFloat (balance['balance']);
                if (balance['type'] === 'frozen')
                    account['used'] = parseFloat (balance['balance']);
                account['total'] = this.sum (account['free'], account['used']);
                result[currency] = account;
            }
        }
        return this.parseBalance (result);
    }

    async fetchOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        if (!symbol)
            throw new ExchangeError (this.id + ' fetchOrders() requires a symbol parameter');
        this.loadMarkets ();
        let market = this.market (symbol);
        let status = undefined;
        if ('type' in params) {
            status = params['type'];
        } else if ('status' in params) {
            status = params['status'];
        } else {
            throw new ExchangeError (this.id + ' fetchOrders() requires a type param or status param for spot market ' + symbol + ' (0 or "open" for unfilled or partial filled orders, 1 or "closed" for filled orders)');
        }
        if ((status === 0) || (status === 'open')) {
            status = 'submitted,partial-filled';
        } else if ((status === 1) || (status === 'closed')) {
            status = 'filled,partial-canceled';
        } else {
            throw new ExchangeError (this.id + ' fetchOrders() wrong type param or status param for spot market ' + symbol + ' (0 or "open" for unfilled or partial filled orders, 1 or "closed" for filled orders)');
        }
        let response = await this.privateGetOrderOrders (this.extend ({
            'symbol': market['id'],
            'states': status,
        }));
        return this.parseOrders (response['data'], market, since, limit);
    }

    async fetchOpenOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        let open = 0; // 0 for unfilled orders, 1 for filled orders
        return await this.fetchOrders (symbol, undefined, undefined, this.extend ({
            'status': open,
        }, params));
    }

    async fetchOrder (id, symbol = undefined, type, params = {}) {
        let response = await this.privateGetOrderOrdersId (this.extend ({
            'id': id,
        }, params));
        if (this.isObject(response) && 'data' in response){
            return this.parseOrder (response['data']);
        } else {
            return { success: false, error: response }
        }
    }

    parseOrderStatus (status) {
        if (status === 'partial-filled') {
            return 'open';
        } else if (status === 'filled') {
            return 'closed';
        } else if (status === 'canceled') {
            return 'canceled';
        } else if (status === 'submitted') {
            return 'open';
        }
        return status;
    }

    parseOrder(order) {
        if ('id' in order){
            let result = this.returnSuccessFetchOrder(order['id'], this.parseOrderStatus(order['state']),
            Number(order['field-amount']), Number(order['amount']), order)
            return result;
        } else {
            return { success: false, error: order }
        }
    }

    async createOrder(symbol, type, side, amount, price = undefined,
        nativeBase, nativeQuote, params = {}) {
        const symbTrans = (symbol.replace("_", "")).toLowerCase()
        const market = this.marketsById[symbTrans]
        if (!this.isObject(market)) {
            throw new ExchangeError(symbol + ' could not find a valid market');
        }
        await this.loadAccounts();
        let order = {
            'account-id': this.accounts[0]['id'],
            'amount': Number(this.amountToPrecision (market.symbol, amount)),
            'symbol': symbTrans,
            'type': side + '-' + type,
        };
        if (type === 'limit')
            order['price'] = Number(this.priceToPrecision (market.symbol, price))
        const response = await this.privatePostOrderOrdersPlace (this.extend (order, params));
        if (this.isObject(response) && 'data' in response && response['data'].length > 0 ){
            let returner = this.returnSuccessCreateOrder(response["data"],response)
            return returner
        } else {
            return this.returnFailureCreateOrder(response)
        }
    }

    async cancelOrder (id, symbol = undefined, side, params = {}) {
        let result = await this.privatePostOrderOrdersIdSubmitcancel ({ 'id': id });
        if (this.isObject(result) && 'data' in result && result.status === "ok"){
            return {'success': true, info: result}
        }
        return {'success': false, error: result}
    }

    async fetchDepositAddress (code, params = {}) {
        let request = {
            'currency': code.toLowerCase(),
        };
        let response;
        try{
            response = await this.privateGetDwDepositVirtualAddresses (this.extend (request, params));
        } catch (e){
            response = await this.privateGetDwDepositVirtualSharedAddressWithTag (this.extend (request, params));
        }
        if(response['status'] === 'ok'){
            let address;
            let tag;
            let data = response['data'];
            console.log(data)
            if(data.address && data.tag){
                address = data.address;
                tag = data.tag;
            } else {
                address = data;
                tag = null;
            }
            return( {
                'currency': code,
                'address': address,
                'status': 'ok',
                'info': response,
                'tag':tag,
            });
        }
        throw new ExchangeError (this.id + ' fetchDepositAddress failed: ' + this.last_http_response);
    }

    calculateFee (symbol, type, side, amount, price, takerOrMaker = 'taker', params = {}) {
        let market = this.markets[symbol];
        let rate = market[takerOrMaker];
        let cost = parseFloat (this.costToPrecision (symbol, amount * rate));
        let key = 'quote';
        if (side === 'sell') {
            cost *= price;
        } else {
            key = 'base';
        }
        return {
            'type': takerOrMaker,
            'currency': market[key],
            'rate': rate,
            'cost': parseFloat (this.feeToPrecision (symbol, cost)),
        };
    }

    async withdraw (currency, amount, address, tag = undefined, params = {}) {
        this.checkAddress (address);
        let request = {
            'address': address, // only supports existing addresses in your withdraw address list
            'amount': amount,
            'currency': currency.toLowerCase (),
        };
        if (tag)
            request['addr-tag'] = tag; // only for XRP?
        let response = await this.privatePostDwWithdrawApiCreate (this.extend (request, params));
        if ('data' in response) {
            const id = response['data'];
            return this.returnSuccessWithdraw(response, id)
        }
        return this.returnFailureWithdraw(response)
    }

    sign (path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        let url = '/';
        if (api === 'market')
            url += api;
        else
            url += this.version;
        url += '/' + this.implodeParams (path, params);
        let query = this.omit (params, this.extractParams (path));
        if (api === 'private') {
            this.checkRequiredCredentials ();
            let timestamp = this.ymdhms (this.milliseconds (), 'T');
            let request = this.keysort (this.extend ({
                'SignatureMethod': 'HmacSHA256',
                'SignatureVersion': '2',
                'AccessKeyId': this.apiKey,
                'Timestamp': timestamp,
            }, query));
            let auth = this.urlencode (request);
            // unfortunately, PHP demands double quotes for the escaped newline symbol
            // eslint-disable-next-line quotes
            let payload = [ method, this.hostname, url, auth ].join ("\n");
            let signature = this.hmac (this.encode (payload), this.encode (this.secret), 'sha256', 'base64');
            auth += '&' + this.urlencode ({ 'Signature': signature });
            url += '?' + auth;
            if (method === 'POST') {
                body = this.json (query);
                headers = {
                    'Content-Type': 'application/json',
                };
            } else {
                headers = {
                    'Content-Type': 'application/x-www-form-urlencoded',
                };
            }
        } else {
            if (Object.keys (params).length)
                url += '?' + this.urlencode (params);
        }
        url = this.urls['api'] + url;
        return { 'url': url, 'method': method, 'body': body, 'headers': headers };
    }

    async request (path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        let response = await this.fetch2 (path, api, method, params, headers, body);
        if ('status' in response)
            if (response['status'] === 'error')
                throw new ExchangeError (this.id + ' ' + this.json (response));
        return response;
    }
};
