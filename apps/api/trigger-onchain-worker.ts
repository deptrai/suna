import { getOnChainIndexQueue } from './src/queue/bullmq/workers/onchain-index';
import { redisConnection } from './src/queue/bullmq/connection';

async function triggerWorker() {
  console.log('Triggering Dune & Nansen Worker manually...');
  const queue = getOnChainIndexQueue();
  
  const job = await queue.add('fetch-onchain-data-manual', {});
  console.log(`Job added with ID: ${job.id}. Worker is processing it in the background...`);
  
  await queue.close();
  redisConnection.quit();
  process.exit(0);
}

triggerWorker().catch(console.error);