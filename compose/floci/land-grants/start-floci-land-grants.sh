#!/bin/bash
set -euo pipefail
export AWS_REGION=eu-west-2
export AWS_DEFAULT_REGION=eu-west-2
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test

#
# Land Grants Backend and Config Broker
#
echo "Land Grants Backend Localstack Startup"

ENDPOINT="--endpoint-url=http://localhost:4566"
ACCOUNT_ID=000000000000

INGEST_BUCKET=land-data
CONFIG_BROKER_BUCKET=configs-bucket
TOPIC_NAME=gfr__sns___config_update
UPDATES_QUEUE_NAME=grants_config_broker_update

# Land data S3 bucket
aws $ENDPOINT s3 mb "s3://${INGEST_BUCKET}" || true
echo "Created S3 bucket: ${INGEST_BUCKET}"

# Config broker S3 bucket
aws $ENDPOINT s3 mb "s3://${CONFIG_BROKER_BUCKET}" || true
echo "Created grants-config-broker S3 bucket: ${CONFIG_BROKER_BUCKET}"

# SQS queue consumed to ingest config changes
QUEUE_URL=$(aws $ENDPOINT sqs create-queue --queue-name "$UPDATES_QUEUE_NAME" --query QueueUrl --output text)
QUEUE_ARN="arn:aws:sqs:${AWS_REGION}:${ACCOUNT_ID}:${UPDATES_QUEUE_NAME}"
echo "Created/located SQS queue: $QUEUE_URL ($QUEUE_ARN)"

# SNS topic published to on config updates
TOPIC_ARN=$(aws $ENDPOINT sns create-topic --name "$TOPIC_NAME" --query TopicArn --output text)
echo "Created/located SNS topic: $TOPIC_ARN"

# Allow the SNS topic to deliver to the SQS queue
aws $ENDPOINT sqs set-queue-attributes \
  --queue-url "$QUEUE_URL" \
  --attributes "{\"Policy\":\"{\\\"Version\\\":\\\"2012-10-17\\\",\\\"Statement\\\":[{\\\"Effect\\\":\\\"Allow\\\",\\\"Principal\\\":{\\\"Service\\\":\\\"sns.amazonaws.com\\\"},\\\"Action\\\":\\\"sqs:SendMessage\\\",\\\"Resource\\\":\\\"${QUEUE_ARN}\\\",\\\"Condition\\\":{\\\"ArnEquals\\\":{\\\"aws:SourceArn\\\":\\\"${TOPIC_ARN}\\\"}}}]}\"}"

# Subscribe the queue to the topic
aws $ENDPOINT sns subscribe \
  --topic-arn "$TOPIC_ARN" \
  --protocol sqs \
  --notification-endpoint "$QUEUE_ARN"

echo "Subscribed $QUEUE_ARN to $TOPIC_ARN"
