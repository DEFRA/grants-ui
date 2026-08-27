#!/bin/bash
set -e

#
# Vendored mirror of fg-gas-backend's compose/floci/start.d/10-setup-resources.sh.
#
# GAS is run here as a prebuilt image (defradigital/fg-gas-backend), so there is
# no fg-gas-backend checkout on disk to mount its Floci setup script from.
# To avoid drift, this file is kept as a faithful, diffable copy of the upstream
# script rather than a hand-written reimplementation. When refreshing, diff against:
#   https://github.com/DEFRA/fg-gas-backend/blob/main/compose/floci/start.d/10-setup-resources.sh
#
# Only two deliberate, grants-ui-specific deviations from upstream:
#   1. awslocal shim (below): grants-ui's floci image and sibling scripts drive
#      the AWS CLI via an explicit --endpoint-url, so we provide `awslocal` when
#      it is not already on PATH, keeping the upstream body verbatim.
#   2. The upstream S3 config-broker seed section is dropped: grants-ui runs its
#      own grants-config-broker which owns and seeds the `configs-bucket` S3
#      bucket (see compose.grants-ui.yml / compose.gas.yml CONFIG_BROKER_S3_BUCKET),
#      and the upstream `config-broker-local` bucket and /etc/floci/seed files are
#      not present in this stack.
#

export AWS_REGION=eu-west-2
export AWS_DEFAULT_REGION=eu-west-2
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test

# grants-ui deviation (1): provide `awslocal` when the image does not ship it, so
# the upstream script body can call `awslocal` unchanged.
if ! command -v awslocal >/dev/null 2>&1; then
  awslocal() { aws --endpoint-url="${AWS_ENDPOINT_URL:-http://localhost:4566}" "$@"; }
fi

# How many times a message may be received before it is moved to the DLQ.
# Defaults to 1 (a single failed receive dead-letters).
# Set MAX_READS=2 in aws.env when you want to peek at the queues.
MAX_READS="${MAX_READS:-1}"
function create_topic() {
  local topic_name=$1
  # Two masking hazards, so every command-substitution assignment carries an
  # explicit `|| return`:
  # 1. `local topic_arn=$(...)` returns the status of `local` (always 0).
  # 2. This function is also called from within $(...) (see create_topic_and_queue),
  #    and bash runs a function body with `set -e` disabled when the function
  #    executes in a context where -e is ignored - so the inner awslocal failure
  #    would otherwise fall through to the final `echo`, which returns 0.
  # `|| return` propagates the failure in every calling context.
  local topic_arn
  topic_arn=$(awslocal sns create-topic \
    --name $topic_name \
    --attributes '{ "FifoTopic":"true","ContentBasedDeduplication":"true"}' \
    --query "TopicArn" \
    --output text) || return
  echo $topic_arn
}
function create_standard_topic() {
  local topic_name=$1
  local topic_arn
  topic_arn=$(awslocal sns create-topic \
    --name $topic_name \
    --query "TopicArn" \
    --output text) || return
  echo $topic_arn
}
function create_queue() {
  local queue_name=$1
  local base="${queue_name%%.fifo}"
  # Create the DLQ. A FIFO source queue requires a FIFO dead-letter queue -
  # the two types must match.
  local dlq_url
  dlq_url=$(
    awslocal sqs create-queue \
      --queue-name "$base-dead-letter-queue.fifo" \
      --attributes '{ "FifoQueue":"true", "ContentBasedDeduplication":"true" }' \
      --query "QueueUrl" --output text
  ) || return
  local dlq_arn
  dlq_arn=$(
    awslocal sqs get-queue-attributes \
      --queue-url $dlq_url \
      --attribute-name "QueueArn" \
      --query "Attributes.QueueArn" \
      --output text
  ) || return
  # Create the queue with DLQ attached
  local queue_url
  queue_url=$(
    awslocal sqs create-queue \
      --queue-name $queue_name \
      --attributes '{ "FifoQueue":"true", "ContentBasedDeduplication":"true", "RedrivePolicy": "{\"deadLetterTargetArn\":\"'$dlq_arn'\",\"maxReceiveCount\":\"'$MAX_READS'\"}" }' \
      --query "QueueUrl" \
      --output text
  ) || return
  local queue_arn
  queue_arn=$(
    awslocal sqs get-queue-attributes \
      --queue-url $queue_url \
      --attribute-name "QueueArn" \
      --query "Attributes.QueueArn" \
      --output text
  ) || return
  echo $queue_arn
}
function subscribe_queue_to_topic() {
  local topic_arn=$1
  local queue_arn=$2
  awslocal sns subscribe --topic-arn $topic_arn --protocol sqs --notification-endpoint $queue_arn --attributes '{ "RawMessageDelivery": "true" }'
}
function create_topic_and_queue() {
  local topic_name=$1
  local queue_name=$2
  echo "$topic_name $queue_name"
  local topic_arn
  topic_arn=$(create_topic $topic_name) || return
  local queue_arn
  queue_arn=$(create_queue $queue_name) || return
  subscribe_queue_to_topic $topic_arn $queue_arn
}
function create_standard_topic() {
  local topic_name=$1
  local topic_arn=$(awslocal sns create-topic \
    --name $topic_name \
    --query "TopicArn" \
    --output text)
  echo $topic_arn
}
function create_standard_queue() {
  local queue_name=$1
  local dlq_url=$(
    awslocal sqs create-queue \
      --queue-name "$queue_name-dead-letter-queue" \
      --query "QueueUrl" --output text
  )
  local dlq_arn=$(
    awslocal sqs get-queue-attributes \
      --queue-url $dlq_url \
      --attribute-name "QueueArn" \
      --query "Attributes.QueueArn" \
      --output text
  )
  local queue_url=$(
    awslocal sqs create-queue \
      --queue-name $queue_name \
      --attributes '{ "RedrivePolicy": "{\"deadLetterTargetArn\":\"'$dlq_arn'\",\"maxReceiveCount\":\"3\"}" }' \
      --query "QueueUrl" \
      --output text
  )
  local queue_arn=$(
    awslocal sqs get-queue-attributes \
      --queue-url $queue_url \
      --attribute-name "QueueArn" \
      --query "Attributes.QueueArn" \
      --output text
  )
  echo $queue_arn
}
function create_standard_topic_and_queue() {
  local topic_name=$1
  local queue_name=$2
  echo "$topic_name $queue_name"
  local topic_arn=$(create_standard_topic $topic_name)
  local queue_arn=$(create_standard_queue $queue_name)
  subscribe_queue_to_topic $topic_arn $queue_arn
}
# Every job is backgrounded to create resources in parallel, and each PID is
# collected so failures can be waited on individually. A bare `wait` always
# returns 0 regardless of what the jobs did, so `set -e` would not catch a
# failed create and this script would exit 0 with resources missing. Floci
# aborts startup and shuts down when an init script exits non-zero, so
# propagating the failure turns a silently half-built emulator into a container
# that refuses to start and says why.
pids=()
create_topic_and_queue "cw__sns__case_status_updated_fifo.fifo" "gas__sqs__update_status_fifo.fifo" & pids+=($!)
create_topic_and_queue "gas__sns__update_agreement_status_fifo.fifo" "update_agreement_status_fifo.fifo" & pids+=($!)
create_topic_and_queue "agreement_status_updated_fifo.fifo" "gas__sqs__update_agreement_status_fifo.fifo" & pids+=($!)
create_topic_and_queue "gas__sns__grant_application_created_fifo.fifo" "gas__sqs__grant_application_created_fifo.fifo" & pids+=($!)
create_topic_and_queue "gas__sns__application_status_updated_fifo.fifo" "gas__sqs__application_status_updated_fifo.fifo" & pids+=($!)
create_topic_and_queue "gas__sns__create_new_case_fifo.fifo" "cw__sqs__create_new_case_fifo.fifo" & pids+=($!)
create_topic_and_queue "gas__sns__update_case_status_fifo.fifo" "cw__sqs__update_status_fifo.fifo" & pids+=($!)
create_topic_and_queue "gas__sns__create_agreement_fifo.fifo" "create_agreement_fifo.fifo" & pids+=($!)
create_topic_and_queue "gas__sns__create_payment_fifo.fifo" "create_payment_fifo.fifo" & pids+=($!)
create_standard_topic_and_queue "gfr__sns___config_update" "gas__sqs__config_version_updated"
create_standard_topic "gas__sns__audit_topic_arn" & pids+=($!)
create_topic "gas__sns__update_agreement_status_fifo.fifo" & pids+=($!)
for pid in "${pids[@]}"; do
  if ! wait "$pid"; then
    echo "SNS/SQS setup failed (pid $pid)" >&2
    exit 1
  fi
done
echo "SNS/SQS ready"

# grants-ui deviation (2): the upstream S3 config-broker seed section is omitted
# here. Upstream seeds a `config-broker-local` bucket from /etc/floci/seed/...,
# but grants-ui runs its own grants-config-broker service which creates and seeds
# the `configs-bucket` S3 bucket that GAS reads from (CONFIG_BROKER_S3_BUCKET).
