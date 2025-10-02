export class TokenomicsAnalysisResponseDto {
  success: boolean;
  data?: any;
  error?: string;
  projectId?: string;
  protocolName?: string;
  tokenAddress?: string;

  // T4.1.2: Token supply analysis
  totalSupply?: number;
  circulatingSupply?: number;
  lockedSupply?: number;
  supplyMetrics?: {
    circulationRatio?: number;
    lockupRatio?: number;
    inflationRate?: number;
  };

  // Market data
  marketCap?: number;
  fullyDilutedValuation?: number;
  tvl?: number;

  // T4.1.3: Distribution analysis
  distributionBreakdown?: {
    team?: {
      percentage: number;
      description: string;
    };
    investors?: {
      percentage: number;
      description: string;
    };
    community?: {
      percentage: number;
      description: string;
    };
    treasury?: {
      percentage: number;
      description: string;
    };
    liquidity?: {
      percentage: number;
      description: string;
    };
  };
  distributionFairness?: number;

  // T4.1.4: Vesting schedule evaluation
  vestingSchedule?: Array<{
    category: string;
    amount: number;
    startDate: Date;
    cliffMonths: number;
    vestingMonths: number;
    unlockSchedule: Array<{
      date: Date;
      amount: number;
      cumulativeAmount: number;
      percentageUnlocked: number;
    }>;
    fairnessScore: number;
  }>;

  // T4.1.5: Utility assessment
  utilityAssessment?: {
    useCases: {
      governance?: {
        enabled: boolean;
        description: string;
        strength: number;
      };
      staking?: {
        enabled: boolean;
        description: string;
        strength: number;
      };
      feeDiscount?: {
        enabled: boolean;
        description: string;
        strength: number;
      };
      collateral?: {
        enabled: boolean;
        description: string;
        strength: number;
      };
      revenueShare?: {
        enabled: boolean;
        description: string;
        strength: number;
      };
      accessRights?: {
        enabled: boolean;
        description: string;
        strength: number;
      };
    };
    utilityScore: number;
    demandDrivers: Array<{
      type: string;
      impact: string;
      description: string;
    }>;
    assessment: string;
  };

  // T4.1.6: Inflation/deflation analysis
  inflationRate?: number;

  // Legacy fields (kept for backward compatibility)
  tokenDistribution?: any;
  liquidityMetrics?: any;
  holderAnalysis?: any;

  // Scores
  tokenomicsScore?: number;
  distributionScore?: number;
  liquidityScore?: number;
  vestingScore?: number;
  confidence?: number;

  // DeFi metrics
  yieldOpportunities?: any[];

  // Flags and warnings
  riskFlags?: string[];
  warnings?: string[];

  // Metadata
  lastUpdated?: Date;
}

