import { db } from './apps/api/src/shared/db';
import { onChainDataIndex } from './packages/db/src/schema/epsilon';
import { count } from 'drizzle-orm';

async function check() {
  try {
    const result = await db.select({ count: count() }).from(onChainDataIndex);
    console.log('Row count:', result[0].count);
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}
check().catch(console.error);
