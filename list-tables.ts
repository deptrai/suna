import { db } from './apps/api/src/shared/db';
import { sql } from 'drizzle-orm';

async function list() {
  const result = await db.execute(sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'epsilon'
  `);
  console.log(result.rows);
  process.exit(0);
}
list().catch(console.error);
