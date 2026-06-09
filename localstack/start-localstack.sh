#!/bin/bash
export AWS_REGION=eu-west-2
export AWS_DEFAULT_REGION=eu-west-2
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test

#
# FCP Audit Service
#

# FCP Audit events topic (matches AUDIT_SNS_TOPIC_ARN default in compose.yml)
aws --endpoint-url=http://localhost:4566 sns create-topic --name fcp_audit_events

# Local stand-in for the FCP Audit service's SQS queue, subscribed to our topic so
# published audit events can be inspected locally. In deployed envs the real FCP
# Audit service requests that its `fcp_audit` queue be subscribed to our topic.
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name fcp_audit
aws --endpoint-url=http://localhost:4566 sns subscribe \
  --topic-arn "arn:aws:sns:eu-west-2:000000000000:fcp_audit_events" \
  --protocol sqs --attributes RawMessageDelivery=true \
  --notification-endpoint "arn:aws:sqs:eu-west-2:000000000000:fcp_audit"

#
# Grants UI Backend and Config Broker
#

ENDPOINT="--endpoint-url=http://localhost:4566"
ACCOUNT_ID=000000000000

TOPIC_NAME=gfr__sns___config_update
UPDATES_QUEUE_NAME=grants_ui_backend__sqs__config_updates
INPUT_QUEUE_NAME=gfr__sqs___config_input

# Config broker S3 bucket
aws $ENDPOINT s3 mb s3://configs-bucket || true
echo "Created S3 bucket"

# Config broker input queue (polled by grants-config-broker)
aws $ENDPOINT sqs create-queue --queue-name "$INPUT_QUEUE_NAME"
echo "Created/located SQS queue: $INPUT_QUEUE_NAME"

# SNS topic published to by grants-config-broker on form-definition changes
TOPIC_ARN=$(aws $ENDPOINT sns create-topic --name "$TOPIC_NAME" --query TopicArn --output text)
echo "Created/located SNS topic: $TOPIC_ARN"

# SQS queue consumed by grants-ui-backend to ingest those changes
QUEUE_URL=$(aws $ENDPOINT sqs create-queue --queue-name "$UPDATES_QUEUE_NAME" --query QueueUrl --output text)
QUEUE_ARN="arn:aws:sqs:${AWS_REGION}:${ACCOUNT_ID}:${UPDATES_QUEUE_NAME}"
echo "Created/located SQS queue: $QUEUE_URL ($QUEUE_ARN)"

# Allow the SNS topic to deliver to the SQS queue
aws $ENDPOINT sqs set-queue-attributes \
  --queue-url "$QUEUE_URL" \
  --attributes "{\"Policy\":\"{\\\"Version\\\":\\\"2012-10-17\\\",\\\"Statement\\\":[{\\\"Effect\\\":\\\"Allow\\\",\\\"Principal\\\":{\\\"Service\\\":\\\"sns.amazonaws.com\\\"},\\\"Action\\\":\\\"sqs:SendMessage\\\",\\\"Resource\\\":\\\"${QUEUE_ARN}\\\",\\\"Condition\\\":{\\\"ArnEquals\\\":{\\\"aws:SourceArn\\\":\\\"${TOPIC_ARN}\\\"}}}]}\"}"

# Subscribe the queue to the topic.
aws $ENDPOINT sns subscribe \
  --topic-arn "$TOPIC_ARN" \
  --protocol sqs \
  --notification-endpoint "$QUEUE_ARN"

echo "Subscribed $QUEUE_ARN to $TOPIC_ARN"
