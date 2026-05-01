#!/bin/sh

echo "Executing: $@"
"$@"

if [ -f FAILED ]; then
  echo "test suite failed"
  cat ./FAILED
  exit 1
fi

echo "test suite passed"
exit 0
