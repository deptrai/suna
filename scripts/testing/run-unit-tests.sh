#!/bin/bash
cd "$(dirname "$0")/../tests"
npm test -- --testPathPattern=unit --coverage
