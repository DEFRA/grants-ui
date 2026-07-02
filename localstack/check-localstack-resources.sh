#!/bin/sh
set -eu

ENDPOINT="${LOCALSTACK_ENDPOINT:-http://localhost:4566}"
REGION="${AWS_REGION:-eu-west-2}"
ACCOUNT_ID="${LOCALSTACK_ACCOUNT_ID:-000000000000}"

LOCALSTACK_REQUIRED_S3_BUCKETS="${LOCALSTACK_REQUIRED_S3_BUCKETS:-configs-bucket}"
LOCALSTACK_REQUIRED_SQS_QUEUES="${LOCALSTACK_REQUIRED_SQS_QUEUES:-fcp_audit,gfr__sqs___config_input,grants_ui_backend__sqs__config_updates}"
LOCALSTACK_REQUIRED_SNS_TOPICS="${LOCALSTACK_REQUIRED_SNS_TOPICS:-fcp_audit_events,gfr__sns___config_update}"

aws_local() {
  aws --endpoint-url="$ENDPOINT" "$@"
}

check_health_endpoint() {
  curl -fsS "$ENDPOINT/_localstack/health" >/dev/null
}

check_buckets() {
  old_ifs=$IFS
  IFS=,
  for bucket in $LOCALSTACK_REQUIRED_S3_BUCKETS; do
    [ -n "$bucket" ] || continue
    aws_local s3api head-bucket --bucket "$bucket" >/dev/null
  done
  IFS=$old_ifs
}

check_queues() {
  old_ifs=$IFS
  IFS=,
  for queue in $LOCALSTACK_REQUIRED_SQS_QUEUES; do
    [ -n "$queue" ] || continue
    aws_local sqs get-queue-url --queue-name "$queue" >/dev/null
  done
  IFS=$old_ifs
}

check_topics() {
  old_ifs=$IFS
  IFS=,
  for topic in $LOCALSTACK_REQUIRED_SNS_TOPICS; do
    [ -n "$topic" ] || continue
    aws_local sns get-topic-attributes --topic-arn "arn:aws:sns:${REGION}:${ACCOUNT_ID}:${topic}" >/dev/null
  done
  IFS=$old_ifs
}

check_health_endpoint
check_buckets
check_queues
check_topics
