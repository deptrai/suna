#!/bin/bash
cd "$(dirname "$0")/../tests"
k6 run load/basic-load.js --out json=load-test-results.json
