import { Injectable } from '@nestjs/common';

@Injectable()
export class CoinGeckoService {
  async getCoinData(coinId: string): Promise<any> {
    return { coinId, data: {} };
  }

  async getMarketData(tokenId: string): Promise<any> {
    return { tokenId, marketData: {} };
  }

  async getDeveloperData(tokenId: string): Promise<any> {
    return { tokenId, developerData: {} };
  }
}

