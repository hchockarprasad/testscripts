class Stock {
  constructor(
    public order: string,
    public position: string,
    public mode: TransactionMode,
    public price: number,
  ) {}
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
  lastTxnMode?: TransactionMode;
  txnCounter = 0;
  currentFactor: number;
  stockSymbol = 'XAUUSD';
  // bounds = new Bounds();

  constructor(
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
    this.txnCounter = 0;
    this.stocks = [];
  }

  async closePosition() {
    for (const stock of this.stocks) {
      await this.connection.closePosition(stock.position);
    }
    this.reset();
  }

  async buyPosition(value: number) {
    let stock = await this.connection.createMarketBuyOrder(
      this.stockSymbol,
      this.currentFactor,
    );

    this.stocks.push(
      new Stock(stock.orderId, stock.positionId, TransactionMode.Buy, value),
    );
    this.txnCounter += 1;
    this.lastTxnMode = TransactionMode.Buy;
    this.currentFactor *= this.jumpFactor;
    //this.bounds.upper = value;
  }

  async sellPosition(value: number) {
    let stock = await this.connection.createMarketSellOrder(
      this.stockSymbol,
      this.currentFactor,
    );

    this.stocks.push(
      new Stock(stock.orderId, stock.positionId, TransactionMode.Sell, value),
    );
    this.txnCounter += 1;
    this.lastTxnMode = TransactionMode.Sell;
    this.currentFactor *= this.jumpFactor;
    //this.bounds.lower = value;
  }

  async triggerClose(value: number, mode: TransactionMode) {
    if (this.maxTxnLimit > 0) {
      if (this.txnCounter <= this.maxTxnLimit && this.lastTxnMode == mode) {
        await this.closePosition();
        await this.buyPosition(value);
        // this.bounds.lower = value - this.threshold;
      }
    } else {
      await this.closePosition();
      await this.buyPosition(value);
      // this.bounds.lower = value - this.threshold;
    }
  }

  async triggerBuy(value: number) {
    if (this.maxTxnLimit > 0) {
      if (this.txnCounter < this.maxTxnLimit) {
        await this.buyPosition(value);
      }
    } else {
      await this.buyPosition(value);
    }
  }

  async triggerSell(value: number) {
    if (this.maxTxnLimit > 0) {
      if (this.txnCounter < this.maxTxnLimit) {
        await this.sellPosition(value);
      }
    } else {
      await this.sellPosition(value);
    }
  }

  removePosition(positionId: string) {
    this.stocks.filter((item) => item.position != positionId);
    this.txnCounter = this.stocks.length;
  }

  get bounds() {
    let upper = this.stocks
      .filter((x) => x.mode == TransactionMode.Buy)
      .at(-1)?.price;
    let lower = this.stocks
      .filter((x) => x.mode == TransactionMode.Sell)
      .at(-1)?.price;
    upper = upper || lower + this.threshold;
    lower = lower || upper - this.threshold;
    return new Bounds(upper, lower);
  }

  async send(price: Price) {
    let upper = this.bounds.upper || price.ask;
    let lower = this.bounds.lower || price.bid;
    console.log('Upper ' + upper);
    console.log('Lower ' + lower);
    if (price.ask >= upper) {
      if (price.ask >= upper + this.threshold) {
        console.log('Upper');
        console.log('Bid ' + price.ask);
        console.log('Upper Bound ' + upper);
        console.log('Threshold' + this.threshold);
        await this.triggerClose(price.ask, TransactionMode.Buy);
      } else if (this.lastTxnMode != TransactionMode.Buy) {
        console.log('Triggered Buy');
        await this.triggerBuy(price.ask);
      }
    } else if (price.bid <= lower) {
      if (price.bid <= lower - this.threshold) {
        console.log('Lower');
        console.log('Bid ' + price.bid);
        console.log('Lower Bound ' + lower);
        console.log('Threshold' + this.threshold);
        await this.triggerClose(price.ask, TransactionMode.Sell);
      } else if (this.lastTxnMode != TransactionMode.Sell) {
        console.log('Triggered Sell');
        await this.triggerSell(price.bid);
      }
    }
  }
}
