export class TokenomicsAnalysisResponseDto {
  success: boolean;
  data?: any;
  error?: string;
  projectId?: string;
  protocolName?: string;
  tokenAddress?: string;
  totalSupply?: number;
  circulatingSupply?: number;
  marketCap?: number;
  fullyDilutedValuation?: number;
  tokenDistribution?: any;
  vestingSchedule?: any[];
  liquidityMetrics?: any;
  holderAnalysis?: any;
  tokenomicsScore?: number;
  distributionScore?: number;
  liquidityScore?: number;
  vestingScore?: number;
  confidence?: number;
  riskFlags?: string[];
  warnings?: string[];
  distributionFairness?: number;
  inflationRate?: number;
  tvl?: number;
  yieldOpportunities?: any[];
  distributionBreakdown?: any;
  lastUpdated?: Date;
}

