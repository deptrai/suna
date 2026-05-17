export interface SwarmRequiredVar {
  name: string;
  label: string;
  placeholder: string;
}

export interface SwarmPreset {
  name: string;
  displayName: string;
  description: string;
  agentCount: number;
  requiredVars: SwarmRequiredVar[];
}

export const SWARM_PRESETS: SwarmPreset[] = [
  {
    name: 'investment_committee',
    displayName: 'Investment Committee',
    description: 'Bull, bear and neutral analysts debate a target asset.',
    agentCount: 3,
    requiredVars: [
      { name: 'target', label: 'Target', placeholder: 'AAPL.US' },
      { name: 'market', label: 'Market', placeholder: 'us | hk | china_a | crypto' },
    ],
  },
  {
    name: 'quant_strategy_desk',
    displayName: 'Quant Strategy Desk',
    description: 'Factor analyst, risk modeler and portfolio constructor.',
    agentCount: 3,
    requiredVars: [
      { name: 'universe', label: 'Universe', placeholder: 'SP500 top 50 by volume' },
      { name: 'lookback_days', label: 'Lookback Days', placeholder: '180' },
    ],
  },
  {
    name: 'crypto_due_diligence',
    displayName: 'Crypto Due Diligence',
    description: 'On-chain, narrative and tokenomics review in one swarm.',
    agentCount: 3,
    requiredVars: [
      { name: 'token_address', label: 'Token Address', placeholder: '0x...' },
      { name: 'chain', label: 'Chain', placeholder: 'ethereum' },
    ],
  },
  {
    name: 'macro_regime_scout',
    displayName: 'Macro Regime Scout',
    description: 'Macro, rates and equity strategists assess regime shifts.',
    agentCount: 3,
    requiredVars: [
      { name: 'region', label: 'Region', placeholder: 'US' },
      { name: 'horizon_months', label: 'Horizon (months)', placeholder: '6' },
    ],
  },
];
