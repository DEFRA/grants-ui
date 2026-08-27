#!/bin/bash
set -e

# Usage:
#   Run all acceptance tests:
#     ./tools/run-acceptance-tests.sh
#
#   Run a specific feature file:
#     ./tools/run-acceptance-tests.sh ./acceptance/test/features/allowlist.feature
#
# Temporarily disabling acceptance tests:
#   Create disable-acceptance.yaml in the repository root (the file is optional):
#
#     acceptance:
#       disable:
#         - suite: grants-ui-acceptance-tests
#           test: Applicant selects actions for a parcel
#           expires: 2026-09-30
#
#   Each entry needs all three keys:
#     suite    one of the suites listed in ACCEPTANCE_SUITES below
#     test     scenario/test title, matched literally as a substring of the
#              title (no escaping needed, regex metacharacters included)
#     expires  UTC date YYYY-MM-DD (disabled up to the end of that day) or
#              timestamp YYYY-MM-DDTHH:MM[:SS][Z]
#
#   Entries only suppress the test until their expiry passes; after that the
#   test runs again, so a quarantine cannot be left in place silently.

TEST_COMMAND='npm run test:ci'
FEATURE_FILE="${1:-}"

RUN_ARGS=""
if [ -n "$FEATURE_FILE" ]; then
  RUN_ARGS="--spec $FEATURE_FILE"
fi

# Suites to run, space-separated. Default is all four (what CI runs — do not
# change that default). Override locally to scope a run, e.g.
#   ACCEPTANCE_SUITES="grants-ui-acceptance-tests" ./tools/run-acceptance-tests.sh
# The grasslands/ woodland suites include @ci tests that assume
# CI-seeded allowlist state absent in a plain local stack.
ACCEPTANCE_SUITES="${ACCEPTANCE_SUITES:-grants-ui-acceptance-tests grants-ui-grasslands-tests grants-ui-woodland-tests}"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DISABLE_FILE="$ROOT_DIR/disable-acceptance.yaml"
NOW_STAMP="$(date -u +%Y%m%d%H%M%S)"

DISABLE_SUITES=()
DISABLE_TESTS=()
DISABLE_EXPIRIES=()

# Test-title filter flag differs per suite runner: the in-repo suite is
# cucumber-js, the grasslands/woodland suites are Playwright.
suite_runner() {
  case "$1" in
    grants-ui-acceptance-tests) printf 'cucumber' ;;
    grants-ui-grasslands-tests | grants-ui-woodland-tests) printf 'playwright' ;;
    *) return 1 ;;
  esac
}

disable_error() {
  echo "ERROR: $DISABLE_FILE:$1: $2" >&2
  exit 1
}

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

# Quotes a value for the eval'd ACCEPTANCE_TESTS_HOOK command.
shell_quote() {
  printf "'%s'" "${1//\'/\'\\\'\'}"
}

# Scalar value: quoted verbatim, otherwise trimmed with any trailing comment
# removed.
yaml_scalar() {
  local v
  v="$(trim "$1")"
  case "$v" in
    \"*\")
      v="${v#\"}"
      v="${v%\"}"
      ;;
    \'*\')
      v="${v#\'}"
      v="${v%\'}"
      ;;
    *)
      v="${v%%[[:space:]]#*}"
      v="$(trim "$v")"
      ;;
  esac
  printf '%s' "$v"
}

# Disable entries name a test literally, so regex metacharacters in a title must
# not reach the runner's filter.
regex_escape() {
  printf '%s' "$1" | sed 's/[][\\^$.|?*+(){}]/\\&/g'
}

# Normalises an expiry to a comparable YYYYMMDDHHMMSS stamp, rejecting anything
# that is not a real UTC calendar time.
expiry_stamp() {
  local value="${1%Z}" date_part time_part year month day hour minute second days

  date_part="${value%%T*}"
  if [ "$value" = "$date_part" ]; then
    time_part='23:59:59'
  else
    time_part="${value#*T}"
  fi

  case "$date_part" in
    [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;;
    *) return 1 ;;
  esac
  case "$time_part" in
    [0-9][0-9]:[0-9][0-9]) time_part="$time_part:00" ;;
    [0-9][0-9]:[0-9][0-9]:[0-9][0-9]) ;;
    *) return 1 ;;
  esac

  year=$((10#${date_part:0:4}))
  month=$((10#${date_part:5:2}))
  day=$((10#${date_part:8:2}))
  hour=$((10#${time_part:0:2}))
  minute=$((10#${time_part:3:2}))
  second=$((10#${time_part:6:2}))

  { [ "$month" -ge 1 ] && [ "$month" -le 12 ]; } || return 1
  { [ "$hour" -le 23 ] && [ "$minute" -le 59 ] && [ "$second" -le 59 ]; } || return 1

  case "$month" in
    4 | 6 | 9 | 11) days=30 ;;
    2)
      if [ $((year % 4)) -eq 0 ] && { [ $((year % 100)) -ne 0 ] || [ $((year % 400)) -eq 0 ]; }; then
        days=29
      else
        days=28
      fi
      ;;
    *) days=31 ;;
  esac
  { [ "$day" -ge 1 ] && [ "$day" -le "$days" ]; } || return 1

  date_part="${date_part//-/}"
  printf '%s' "$date_part${time_part//:/}"
}

item_suite=''
item_test=''
item_expires=''
item_line=0
have_item=0

store_item() {
  [ "$have_item" -eq 1 ] || return 0
  [ -n "$item_suite" ] || disable_error "$item_line" "disable entry is missing 'suite'"
  [ -n "$item_test" ] || disable_error "$item_line" "disable entry is missing 'test'"
  [ -n "$item_expires" ] || disable_error "$item_line" "disable entry is missing 'expires'"
  suite_runner "$item_suite" >/dev/null ||
    disable_error "$item_line" "unknown suite '$item_suite'"
  expiry_stamp "$item_expires" >/dev/null ||
    disable_error "$item_line" "invalid expires '$item_expires' (expected YYYY-MM-DD or YYYY-MM-DDTHH:MM[:SS][Z])"

  DISABLE_SUITES+=("$item_suite")
  DISABLE_TESTS+=("$item_test")
  DISABLE_EXPIRIES+=("$item_expires")

  have_item=0
  item_suite=''
  item_test=''
  item_expires=''
}

store_key_value() {
  local kv="$1" line_no="$2" key value
  case "$kv" in
    *:*)
      key="$(trim "${kv%%:*}")"
      value="$(yaml_scalar "${kv#*:}")"
      ;;
    *) disable_error "$line_no" "expected 'key: value' but found '$kv'" ;;
  esac

  case "$key" in
    suite) item_suite="$value" ;;
    test) item_test="$value" ;;
    expires) item_expires="$value" ;;
    *) disable_error "$line_no" "unknown key '$key' (expected suite, test or expires)" ;;
  esac
}

read_disable_file() {
  local line stripped rest line_no=0 indent disable_indent=0 in_acceptance=0 in_disable=0

  while IFS= read -r line || [ -n "$line" ]; do
    line_no=$((line_no + 1))
    line="${line%$'\r'}"
    [ -n "${line//[[:space:]]/}" ] || continue

    stripped="${line#"${line%%[![:space:]]*}"}"
    case "$stripped" in '#'*) continue ;; esac
    indent=$((${#line} - ${#stripped}))

    if [ "$indent" -eq 0 ]; then
      store_item
      in_disable=0
      case "$stripped" in
        acceptance:) in_acceptance=1 ;;
        *) in_acceptance=0 ;;
      esac
      continue
    fi

    [ "$in_acceptance" -eq 1 ] || continue

    if [ "$in_disable" -eq 0 ]; then
      case "$stripped" in
        disable:)
          in_disable=1
          disable_indent="$indent"
          ;;
      esac
      continue
    fi

    case "$stripped" in
      -*)
        store_item
        have_item=1
        item_line="$line_no"
        rest="$(trim "${stripped#-}")"
        [ -z "$rest" ] || store_key_value "$rest" "$line_no"
        ;;
      *)
        if [ "$have_item" -eq 1 ] && [ "$indent" -gt "$disable_indent" ]; then
          store_key_value "$stripped" "$line_no"
        else
          store_item
          in_disable=0
        fi
        ;;
    esac
  done < "$DISABLE_FILE"

  store_item
}

if [ -f "$DISABLE_FILE" ]; then
  read_disable_file
  if [ "${#DISABLE_SUITES[@]}" -gt 0 ]; then
    echo "Acceptance disable list ($DISABLE_FILE):"
    for i in "${!DISABLE_SUITES[@]}"; do
      if [ "$((10#$(expiry_stamp "${DISABLE_EXPIRIES[$i]}")))" -lt "$((10#$NOW_STAMP))" ]; then
        echo "  RUN  ${DISABLE_SUITES[$i]} :: ${DISABLE_TESTS[$i]} (expired ${DISABLE_EXPIRIES[$i]} — fix the test or remove the entry)"
      else
        echo "  SKIP ${DISABLE_SUITES[$i]} :: ${DISABLE_TESTS[$i]} (expires ${DISABLE_EXPIRIES[$i]})"
      fi
    done
  fi
fi

# Alternation of the still-disabled, regex-escaped test titles for one suite.
disabled_pattern() {
  local suite="$1" pattern='' escaped i
  for i in "${!DISABLE_SUITES[@]}"; do
    [ "${DISABLE_SUITES[$i]}" = "$suite" ] || continue
    [ "$((10#$(expiry_stamp "${DISABLE_EXPIRIES[$i]}")))" -ge "$((10#$NOW_STAMP))" ] || continue
    escaped="$(regex_escape "${DISABLE_TESTS[$i]}")"
    if [ -z "$pattern" ]; then pattern="$escaped"; else pattern="$pattern|$escaped"; fi
  done
  printf '%s' "$pattern"
}

# Trailing ` -- <args>` for `npm run test:ci`, empty when there are no args.
args_suffix() {
  local args
  args="$(trim "$1")"
  [ -n "$args" ] || return 0
  printf ' -- %s' "$args"
}

# Command run inside a suite's container, with any active disable entries
# applied as a runner-native test-title filter.
suite_step_command() {
  local suite="$1" pattern name_arg payload
  pattern="$(disabled_pattern "$suite")"

  if [ -z "$pattern" ]; then
    printf '%s' "$TEST_COMMAND$(args_suffix "$RUN_ARGS")"
    return 0
  fi

  case "$(suite_runner "$suite")" in
    cucumber)
      name_arg="--name $(shell_quote "^(?!.*(?:$pattern))")"
      # cucumber-js hangs instead of exiting when its parallel workers are left
      # with no matching scenarios (MAX_INSTANCES defaults to 3), so let
      # cucumber-js itself resolve the same selection in a single-process dry
      # run and skip the suite when the filter leaves nothing behind.
      payload="if ./node_modules/.bin/cucumber-js --config cucumber.ci.js --dry-run --parallel 0 --format summary $(trim "$RUN_ARGS $name_arg") | grep -q '^0 scenarios'; then"
      payload="$payload echo 'All scenarios are disabled - nothing to run'; exit 0; fi;"
      payload="$payload $TEST_COMMAND$(args_suffix "$RUN_ARGS $name_arg")"
      printf 'sh -c %s' "$(shell_quote "$payload")"
      ;;
    playwright)
      # --pass-with-no-tests: these suites are small enough that a disable entry
      # can legitimately leave the run empty.
      printf '%s' "$TEST_COMMAND$(args_suffix "$RUN_ARGS --grep-invert $(shell_quote "$pattern") --pass-with-no-tests")"
      ;;
  esac
}

HOOK=""
for suite in $ACCEPTANCE_SUITES; do
  step="docker compose -f compose.tests.yml run --quiet-pull --rm ${suite} $(suite_step_command "$suite")"
  if [ -z "$HOOK" ]; then HOOK="$step"; else HOOK="$HOOK && $step"; fi
done
export ACCEPTANCE_TESTS_HOOK="$HOOK"

"$(dirname "$0")/docker-compose-smoke-test.sh"
