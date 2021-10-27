class Stock {
  constructor(public order: string, public position: string) {}
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
  constructor(public upper = 0, public lower = 0) {}

  isInitialized() {
    return this.upper > 0 || this.lower > 0;
  }
}

export class Executor {
  stocks: Array<Stock> = [];
  lastTxnMode?: TransactionMode;
  txnCounter = 0;
  currentFactor: number;
  stockSymbol = 'XAUUSD';
  bounds = new Bounds();

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

  async buyPosition() {
    let stock = await this.connection.createMarketBuyOrder(
      this.stockSymbol,
      this.currentFactor,
    );

    this.stocks.push(new Stock(stock.orderId, stock.positionId));
    this.txnCounter += 1;
    this.lastTxnMode = TransactionMode.Buy;
    this.currentFactor *= this.jumpFactor;
  }

  async sellPosition() {
    let stock = await this.connection.createMarketSellOrder(
      this.stockSymbol,
      this.currentFactor,
    );

    this.stocks.push(new Stock(stock.orderId, stock.positionId));
    this.txnCounter += 1;
    this.lastTxnMode = TransactionMode.Sell;
    this.currentFactor *= this.jumpFactor;
  }

  async triggerClose(ask: number, mode: TransactionMode) {
    if (this.maxTxnLimit > 0) {
      if (this.txnCounter <= this.maxTxnLimit && this.lastTxnMode == mode) {
        await this.closePosition();
        await this.buyPosition();
        this.bounds = new Bounds(ask, ask - this.threshold);
        console.log(this.bounds);
      }
    } else {
      await this.closePosition();
      await this.buyPosition();
      this.bounds = new Bounds(ask, ask - this.threshold);
    }
  }

  async triggerBuy() {
    if (this.maxTxnLimit > 0) {
      if (this.txnCounter < this.maxTxnLimit) {
        await this.buyPosition();
      }
    } else {
      await this.buyPosition();
    }
  }

  async triggerSell() {
    if (this.maxTxnLimit > 0) {
      if (this.txnCounter < this.maxTxnLimit) {
        await this.sellPosition();
      }
    } else {
      await this.sellPosition();
    }
  }

  async send(price: Price) {
    if (this.bounds.isInitialized()) {
      if (price.ask >= this.bounds.upper + this.threshold) {
        console.log('Upper');
        console.log('Bid ' + price.ask);
        console.log('Upper Bound ' + this.bounds.upper);
        console.log('Threshold' + this.threshold);
        await this.triggerClose(price.ask, TransactionMode.Buy);
      } else if (price.bid <= this.bounds.lower - this.threshold) {
        console.log('Lower');
        console.log('Bid ' + price.bid);
        console.log('Lower Bound ' + this.bounds.lower);
        console.log('Threshold' + this.threshold);
        await this.triggerClose(price.ask, TransactionMode.Sell);
      } else if (
        price.ask >= this.bounds.upper &&
        this.lastTxnMode != TransactionMode.Buy
      ) {
        this.triggerBuy();
      } else if (
        price.bid <= this.bounds.lower &&
        this.lastTxnMode != TransactionMode.Sell
      ) {
        this.triggerSell();
      }
    } else {
      await this.buyPosition();
      this.bounds = new Bounds(price.ask, price.ask - this.threshold);
      console.log('Upper Bound ' + this.bounds.upper);
      console.log('Lower Bound ' + this.bounds.lower);
    }
  }
}
