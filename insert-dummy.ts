import { db } from './apps/api/src/shared/db';
import { onChainDataIndex } from './packages/db/src/schema/epsilon';

async function insert() {
  try {
    await db.insert(onChainDataIndex).values({
        source: 'dune',
        metricName: 'test',
        metricValue: { test: 1 },
        timestamp: new Date(),
    });
    console.log('Inserted');
  } catch (err) {
    console.error('Insert failed:', err);
  }
  process.exit(0);
}
insert().catch(console.error);
