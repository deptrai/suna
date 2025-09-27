#!/bin/bash
cd "$(dirname "$0")/../tests"
npx playwright test --reporter=html
