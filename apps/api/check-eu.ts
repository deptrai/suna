import { Daytona } from '@daytonaio/sdk';
const daytona = new Daytona({
  apiKey: 'dtn_ef6fa4e8e1740060eaab259b59cc0b8e1dc14bdde177173ba2902d7708ad09f7',
  apiUrl: 'https://app.daytona.io/api', target: 'eu' as any,
});
const list: any = await daytona.list();
const items = list?.items || list?.data || (Array.isArray(list) ? list : []);
console.log('=== Daytona EU sandboxes ===');
for (const s of items) console.log(`  ${s.id}  state=${s.state}`);

console.log('\n=== EPSILON_API_URL inside sandbox c10fd062 (last good) ===');
try {
  const sb = await daytona.get('c10fd062-8d78-4e1e-a760-007e0ac420b9');
  const r = await sb.process.executeCommand('echo "EPSILON_API_URL=$EPSILON_API_URL"; curl -sS -m 5 -o /dev/null -w "tunnel reachable: %{http_code}\\n" "$EPSILON_API_URL/v1/health" 2>&1', undefined, 15000);
  console.log(r.result);
} catch (e: any) {
  console.log('  cannot reach:', e?.message?.slice(0, 100));
}
