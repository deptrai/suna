import * as fs from 'fs';
const path = 'apps/web/src/components/tabs/page-tab-content.tsx';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(
  "'/marketplace': MarketplacePage,",
  "'/marketplace': MarketplacePage,\n        '/markets': MarketsPage,"
);
fs.writeFileSync(path, content);
