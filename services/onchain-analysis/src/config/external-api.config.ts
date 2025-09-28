/**
 * T2.1.1b: External API Configuration
 * Moralis, DeFiLlama, and DexScreener API configuration
 */

import { registerAs } from '@nestjs/config';

export default registerAs('externalApi', () => ({
  // Moralis API Configuration
  moralis: {
    apiKey: process.env.MORALIS_API_KEY,
    baseUrl: process.env.MORALIS_API_URL || 'https://deep-index.moralis.io/api/v2.2',
    timeout: parseInt(process.env.MORALIS_TIMEOUT, 10) || 30000,
    rateLimit: {
      requestsPerSecond: parseInt(process.env.MORALIS_RATE_LIMIT, 10) || 25,
      burstLimit: parseInt(process.env.MORALIS_BURST_LIMIT, 10) || 100,
    },
    retryConfig: {
      maxRetries: parseInt(process.env.MORALIS_MAX_RETRIES, 10) || 3,
      retryDelay: parseInt(process.env.MORALIS_RETRY_DELAY, 10) || 1000,
      backoffMultiplier: parseFloat(process.env.MORALIS_BACKOFF_MULTIPLIER) || 2,
    },
    endpoints: {
      tokenMetadata: '/erc20/metadata',
      tokenPrice: '/erc20/{address}/price',
      tokenStats: '/erc20/{address}/stats',
      tokenHolders: '/erc20/{address}/owners',
      tokenTransfers: '/erc20/{address}/transfers',
      walletTokens: '/{address}/erc20',
      walletTransactions: '/{address}',
      blockByNumber: '/block/{block_number}',
      nativeBalance: '/{address}/balance',
    },
  },

  // DeFiLlama API Configuration
  defillama: {
    baseUrl: process.env.DEFILLAMA_API_URL || 'https://api.llama.fi',
    timeout: parseInt(process.env.DEFILLAMA_TIMEOUT, 10) || 30000,
    rateLimit: {
      requestsPerSecond: parseInt(process.env.DEFILLAMA_RATE_LIMIT, 10) || 10,
      burstLimit: parseInt(process.env.DEFILLAMA_BURST_LIMIT, 10) || 50,
    },
    retryConfig: {
      maxRetries: parseInt(process.env.DEFILLAMA_MAX_RETRIES, 10) || 3,
      retryDelay: parseInt(process.env.DEFILLAMA_RETRY_DELAY, 10) || 1000,
      backoffMultiplier: parseFloat(process.env.DEFILLAMA_BACKOFF_MULTIPLIER) || 2,
    },
    endpoints: {
      protocols: '/protocols',
      protocol: '/protocol/{protocol}',
      tvl: '/v2/historicalChainTvl',
      yields: '/pools',
      yieldHistory: '/chart/{pool}',
      coins: '/coins/prices/current/{coins}',
      coinHistory: '/coins/historical/{timestamp}/{coins}',
      stablecoins: '/stablecoins',
      volumes: '/overview/dexs',
      fees: '/overview/fees',
    },
  },

  // DexScreener API Configuration
  dexscreener: {
    baseUrl: process.env.DEXSCREENER_API_URL || 'https://api.dexscreener.com',
    timeout: parseInt(process.env.DEXSCREENER_TIMEOUT, 10) || 30000,
    rateLimit: {
      requestsPerSecond: parseInt(process.env.DEXSCREENER_RATE_LIMIT, 10) || 5,
      burstLimit: parseInt(process.env.DEXSCREENER_BURST_LIMIT, 10) || 20,
    },
    retryConfig: {
      maxRetries: parseInt(process.env.DEXSCREENER_MAX_RETRIES, 10) || 3,
      retryDelay: parseInt(process.env.DEXSCREENER_RETRY_DELAY, 10) || 2000,
      backoffMultiplier: parseFloat(process.env.DEXSCREENER_BACKOFF_MULTIPLIER) || 2,
    },
    endpoints: {
      tokenPairs: '/latest/dex/tokens/{tokenAddress}',
      pairInfo: '/latest/dex/pairs/{chainId}/{pairAddress}',
      search: '/latest/dex/search',
      trending: '/latest/dex/trending',
      gainers: '/latest/dex/gainers',
      losers: '/latest/dex/losers',
    },
  },

  // CoinGecko API Configuration (backup/additional data)
  coingecko: {
    apiKey: process.env.COINGECKO_API_KEY,
    baseUrl: process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3',
    timeout: parseInt(process.env.COINGECKO_TIMEOUT, 10) || 30000,
    rateLimit: {
      requestsPerSecond: parseInt(process.env.COINGECKO_RATE_LIMIT, 10) || 10,
      burstLimit: parseInt(process.env.COINGECKO_BURST_LIMIT, 10) || 30,
    },
    retryConfig: {
      maxRetries: parseInt(process.env.COINGECKO_MAX_RETRIES, 10) || 3,
      retryDelay: parseInt(process.env.COINGECKO_RETRY_DELAY, 10) || 1000,
      backoffMultiplier: parseFloat(process.env.COINGECKO_BACKOFF_MULTIPLIER) || 2,
    },
    endpoints: {
      tokenInfo: '/coins/{id}',
      tokenPrice: '/simple/price',
      tokenHistory: '/coins/{id}/history',
      tokenMarket: '/coins/{id}/market_chart',
      trending: '/search/trending',
      global: '/global',
    },
  },

  // Chain Configuration
  chains: {
    ethereum: {
      chainId: 1,
      name: 'Ethereum',
      rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo',
      explorerUrl: 'https://etherscan.io',
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
      },
    },
    bsc: {
      chainId: 56,
      name: 'BNB Smart Chain',
      rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed1.binance.org',
      explorerUrl: 'https://bscscan.com',
      nativeCurrency: {
        name: 'BNB',
        symbol: 'BNB',
        decimals: 18,
      },
    },
    polygon: {
      chainId: 137,
      name: 'Polygon',
      rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
      explorerUrl: 'https://polygonscan.com',
      nativeCurrency: {
        name: 'MATIC',
        symbol: 'MATIC',
        decimals: 18,
      },
    },
    arbitrum: {
      chainId: 42161,
      name: 'Arbitrum One',
      rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
      explorerUrl: 'https://arbiscan.io',
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
      },
    },
    optimism: {
      chainId: 10,
      name: 'Optimism',
      rpcUrl: process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io',
      explorerUrl: 'https://optimistic.etherscan.io',
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
      },
    },
    avalanche: {
      chainId: 43114,
      name: 'Avalanche',
      rpcUrl: process.env.AVALANCHE_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc',
      explorerUrl: 'https://snowtrace.io',
      nativeCurrency: {
        name: 'AVAX',
        symbol: 'AVAX',
        decimals: 18,
      },
    },
  },

  // Global API Settings
  global: {
    defaultTimeout: parseInt(process.env.API_DEFAULT_TIMEOUT, 10) || 30000,
    maxConcurrentRequests: parseInt(process.env.API_MAX_CONCURRENT, 10) || 10,
    enableCaching: process.env.API_ENABLE_CACHING !== 'false',
    cacheDefaultTtl: parseInt(process.env.API_CACHE_TTL, 10) || 300, // 5 minutes
    enableMetrics: process.env.API_ENABLE_METRICS !== 'false',
    enableLogging: process.env.API_ENABLE_LOGGING !== 'false',
    userAgent: process.env.API_USER_AGENT || 'ChainLens-OnChain-Service/1.0.0',
  },
}));
