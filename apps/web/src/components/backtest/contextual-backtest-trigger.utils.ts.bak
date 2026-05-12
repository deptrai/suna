import JSON5 from 'json5';

const ASSET_PATTERN = /^[A-Z0-9]+-[A-Z0-9]+$/;
const TIMEFRAME_PATTERN = /^\d+[mhdwM]$/;

export function isStrategy(code: string): boolean {
  return code.includes('"simulation_environment"') && code.includes('"context_rules"');
}

export function extractInitialProps(code: string) {
  let initialAsset = 'BTC-USDT';
  let initialTimeframe = '4h';
  try {
    const parsed = JSON5.parse(code);
    const asset = parsed?.context_rules?.assets?.[0];
    if (typeof asset === 'string' && ASSET_PATTERN.test(asset)) {
      initialAsset = asset;
    }
    const timeframe = parsed?.context_rules?.timeframe;
    if (typeof timeframe === 'string' && TIMEFRAME_PATTERN.test(timeframe)) {
      initialTimeframe = timeframe;
    }
  } catch {
    // Fall back to defaults on parse failure
  }
  return { initialAsset, initialTimeframe };
}
