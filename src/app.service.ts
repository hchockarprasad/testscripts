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

      const executor = new Executor(connection, 5, 2, 5);
      const quoteListener = new QuoteListener(executor);
      connection.addSynchronizationListener(quoteListener);
      await connection.waitSynchronized();
      await connection.subscribeToMarketData('XAUUSD');
    }
  }

  async init() {
    await this.connectMetaApi();
  }

  getHello(): string {
    return 'Hello World!';
  }
}
