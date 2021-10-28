import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import MetaApi from 'metaapi.cloud-sdk';
import { SynchronizationListener } from 'metaapi.cloud-sdk';

import { Executor, Price } from './executor';

const SYMBOL = 'XAUUSD';

class QuoteListener extends SynchronizationListener {
  constructor(private executor: Executor) {
    super();
  }

  async onSymbolPriceUpdated(_: string, price: Price) {
    if (price.symbol === SYMBOL) {
      await this.executor.send(price);
    }
  }

  async onPositionRemoved(_: string, positionId: string) {
    this.executor.removePosition(positionId);
  }
}

@Injectable()
export class AppService {
  _metaApi?: any;
  constructor(private config: ConfigService) {}

  get metaApi() {
    return this._metaApi;
  }

  async connectMetaApi() {
    this._metaApi = new MetaApi(this.config.get('token'));
    let accounts = await this._metaApi.metatraderAccountApi.getAccounts();
    for (const account of accounts) {
      let connection = await account.getStreamingConnection();
      await connection.waitSynchronized();
      await connection.subscribeToMarketData('XAUUSD');
      let env = JSON.parse(this.config.get('execConfig'));
      let { jumpFactor, threshold, initFactor, maxTxnLimit } = env[account.id];
      const executor = new Executor(account.name, connection, jumpFactor, threshold, initFactor, maxTxnLimit);
      const quoteListener = new QuoteListener(executor);
      connection.addSynchronizationListener(quoteListener);
    }
  }

  async init() {
    await this.connectMetaApi();
  }

  getHello(): string {
    return 'Hello World!';
  }
}
