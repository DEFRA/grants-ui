#!/bin/sh

echo "Executing: $@"
"$@"
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo "test suite failed"
  exit $EXIT_CODE
fi

echo "test suite passed"
exit 0
