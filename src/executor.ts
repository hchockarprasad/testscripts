class Stock {
  isOpen = true;
  constructor(
    public order: string,
    public position: string,
    public mode: TransactionMode,
    public price: number,
    public qty: number,
  ) {}

  close() {
    this.isOpen = false;
  }
}

export class Price {
  bid: number;
  ask: number;
  symbol: string;
}

enum TransactionMode {
  Buy,
  Sell,
}

class Bounds {
  constructor(public upper: number, public lower: number) {}
}

export class Executor {
  stocks: Array<Stock> = [];
  currentFactor: number;
  stockSymbol = 'XAUUSD';

  constructor(
    public name: string,
    private connection: any,
    private jumpFactor: number,
    private threshold: number,
    private initFactor = 1,
    private maxTxnLimit = 2,
  ) {
    this.currentFactor = initFactor;
  }

  reset() {
    this.currentFactor = this.initFactor;
    this.stocks = [];
  }

  async closePosition() {
    for (const stock of this.stocks) {
      if (stock.isOpen) {
        await this.connection.closePosition(stock.position);
      }
    }
    this.reset();
  }

  getMissing(mode: TransactionMode) {
    return this.stocks
      .filter((x) => x.mode == mode && !x.isOpen)
      .map((x) => x.qty)
      .reduce((prev, curr) => prev + curr, 0);
  }

  async buyPosition(value: number) {
    console.log('Bought for' + value + ' with factor ' + this.currentFactor);
    let stock = await this.connection.createMarketBuyOrder(this.stockSymbol, this.currentFactor);
    console.log(stock);

    let s = new Stock(stock.orderId, stock.positionId, TransactionMode.Buy, value, this.currentFactor);
    this.stocks.push(s);
    this.currentFactor *= this.jumpFactor;
  }

  async sellPosition(value: number) {
    console.log('Sold for' + value + ' with factor ' + this.currentFactor);
    let stock = await this.connection.createMarketSellOrder(this.stockSymbol, this.currentFactor);

    this.stocks.push(new Stock(stock.orderId, stock.positionId, TransactionMode.Sell, value, this.currentFactor));
    this.currentFactor *= this.jumpFactor;
  }

  async triggerClose(value: number, mode: TransactionMode) {
    if (this.maxTxnLimit > 0) {
      if (this.counter <= this.maxTxnLimit && this.lastMode == mode) {
        await this.closePosition();
        await this.buyPosition(value);
      }
    } else {
      await this.closePosition();
      await this.buyPosition(value);
    }
  }

  async triggerBuy(value: number) {
    if (this.maxTxnLimit > 0) {
      if (this.counter < this.maxTxnLimit) {
        await this.buyPosition(value);
      }
    } else {
      await this.buyPosition(value);
    }
  }

  async triggerSell(value: number) {
    if (this.maxTxnLimit > 0) {
      if (this.counter < this.maxTxnLimit) {
        await this.sellPosition(value);
      }
    } else {
      await this.sellPosition(value);
    }
  }

  removePosition(positionId: string) {
    this.stocks.find((item) => item.position == positionId)?.close();
  }

  get counter() {
    return this.stocks.length;
  }

  get lastMode() {
    return this.stocks.at(-1)?.mode;
  }

  get bounds() {
    let upper = this.stocks.filter((x) => x.mode == TransactionMode.Buy).at(-1)?.price;
    let lower = this.stocks.filter((x) => x.mode == TransactionMode.Sell).at(-1)?.price;
    upper = upper || lower + this.threshold;
    lower = lower || upper - this.threshold;
    return new Bounds(upper, lower);
  }

  async send(price: Price) {
    let upper = this.bounds.upper || price.ask;
    let lower = this.bounds.lower || price.bid;
    if (price.ask >= upper) {
      if (price.ask >= upper + this.threshold) {
        await this.triggerClose(price.ask, TransactionMode.Buy);
      } else if (this.lastMode != TransactionMode.Buy) {
        console.log('Triggered Buy from ' + this.name);
        console.log(this.stocks.length);
        await this.triggerBuy(price.ask);
      }
    } else if (price.bid <= lower) {
      if (price.bid <= lower - this.threshold) {
        await this.triggerClose(price.ask, TransactionMode.Sell);
      } else if (this.lastMode != TransactionMode.Sell) {
        console.log('Triggered Sell ' + this.name);
        await this.triggerSell(price.bid);
      }
    }
  }
}
