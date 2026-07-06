#!/bin/bash
set -e

# Backwards-compatible entry point for running the full Docker smoke suite.

"$(dirname "$0")/prepare-docker-test-stack.sh"
