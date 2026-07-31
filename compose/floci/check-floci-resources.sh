#!/bin/sh
set -eu

ENDPOINT="${FLOCI_ENDPOINT:-http://localhost:4566}"
REGION="${AWS_REGION:-eu-west-2}"
ACCOUNT_ID="${FLOCI_ACCOUNT_ID:-000000000000}"

FLOCI_REQUIRED_S3_BUCKETS="${FLOCI_REQUIRED_S3_BUCKETS:-configs-bucket}"
FLOCI_REQUIRED_SQS_QUEUES="${FLOCI_REQUIRED_SQS_QUEUES:-fcp_audit,gfr__sqs___config_input,grants_ui_backend__sqs__config_updates}"
FLOCI_REQUIRED_SNS_TOPICS="${FLOCI_REQUIRED_SNS_TOPICS:-fcp_audit_events,gfr__sns___config_update}"

# Maximum time (seconds) to wait for startup resources.
WAIT_TIMEOUT="${FLOCI_HEALTHCHECK_TIMEOUT:-30}"

log() {
  echo "[healthcheck] $(date -Iseconds) $*" >&2
}

aws_local() {
  aws --endpoint-url="$ENDPOINT" --region="$REGION" "$@"
}

check_endpoint() {
  log "checking STS"
  aws_local sts get-caller-identity >/dev/null
  log "STS OK"
}

check_buckets() {
  log "checking buckets"
  old_ifs=$IFS
  IFS=,
  for bucket in $FLOCI_REQUIRED_S3_BUCKETS; do
    [ -n "$bucket" ] || continue
    aws_local s3api head-bucket --bucket "$bucket" >/dev/null
  done
  IFS=$old_ifs
  log "buckets OK"
}

check_queues() {
  log "checking queues"
  old_ifs=$IFS
  IFS=,
  for queue in $FLOCI_REQUIRED_SQS_QUEUES; do
    [ -n "$queue" ] || continue
    aws_local sqs get-queue-url --queue-name "$queue" >/dev/null
  done
  IFS=$old_ifs
  log "queues OK"
}

check_topics() {
  log "checking topics"
  old_ifs=$IFS
  IFS=,
  for topic in $FLOCI_REQUIRED_SNS_TOPICS; do
    [ -n "$topic" ] || continue
    aws_local sns get-topic-attributes --topic-arn "arn:aws:sns:${REGION}:${ACCOUNT_ID}:${topic}" >/dev/null
  done
  IFS=$old_ifs
  log "topics OK"
}

wait_for_resources() {
  elapsed=0

log "waiting for resources"

  while [ "$elapsed" -lt "$WAIT_TIMEOUT" ]; do
    if (
        check_endpoint
        check_buckets
        check_queues
        check_topics
      ); then
      log "all resources ready"
      exit 0
    fi

    log "not ready yet"
    sleep 1
    elapsed=$((elapsed + 1))
  done

  log "timed out"
  echo "Timed out waiting for Floci resources after ${WAIT_TIMEOUT}s" >&2
  exit 1
}

wait_for_resources
