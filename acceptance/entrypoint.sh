#!/bin/sh

echo "Executing: $@"
"$@"
STATUS=$?

if [ $STATUS -ne 0 ]; then
  echo "test suite failed"
  exit 1
fi

echo "test suite passed"
exit 0
