import { db } from './apps/api/src/shared/db';
import { onChainDataIndex } from './packages/db/src/schema/epsilon';

async function insert() {
  try {
    await db.insert(onChainDataIndex).values({
        source: 'dune',
        metricName: 'protocol_metrics',
        metricValue: { 
            id: 'proto-1', 
            name: 'Test Protocol', 
            symbol: 'TP', 
            tvl: 1000, 
            apy7d: 0.1, 
            apy30d: 0.1, 
            chain: 'eth', 
            change24h: 0.05, 
            sparkline7d: [0.1, 0.2] 
        },
        timestamp: new Date(),
    });
    console.log('Inserted');
  } catch (err) {
    console.error('Insert failed:', err);
  }
  process.exit(0);
}
insert().catch(console.error);
