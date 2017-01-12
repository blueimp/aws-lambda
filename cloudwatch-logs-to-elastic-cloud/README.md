# cloudwatch-logs-to-elastic-cloud
CloudWatch Logs to Elasticsearch streaming function for
[AWS Lambda](https://aws.amazon.com/lambda/).

This is provided as alternative to the AWS Elasticsearch Service streaming
Lambda function and supports any Elasticsearch service with an
HTTPS endpoint and HTTP Basic Access Authentication, e.g.
[Elastic Cloud](https://cloud.elastic.co).

## Setup

### Function configuration
Add the function code to AWS Lambda with the following configuration options:  

Key     | Value
--------|--------------
Runtime | Node.js 4.3
Handler | index.handler
Role    | AWSLambdaBasicExecutionRole
Memory  | 128 (MB)
Timeout | 10 sec
KMS key | aws/lambda

### Environment variables
Set the following required environment variables for the Lambda function:

Key      | Value
---------|--------------
hostname | Hostname of the Elasticsearch cluster **HTTPS** endpoint.
port     | Port number of the Elasticsearch cluster **HTTPS** endpoint.
username | Name of an ES user with **create_index** and **write** permissions.
encpass  | [AWS KMS](https://aws.amazon.com/kms/) encrypted password.

Set the following optional environment variables for the Lambda function:

Key        | Value
-----------|--------------
pipeline   | The Elasticsearch ingest pipeline to use.
piperegexp | RegExp matched with the log group if the pipeline applies.
pipefields | Required fields for the pipeline to add if missing, e.g.:
           | `http_user_agent= real_ip=127.0.0.1`

### Trigger configuration
Add any CloudWatch logs group as trigger for the Lambda function.

## License
Released under the [MIT license](https://opensource.org/licenses/MIT).

## Author
[Sebastian Tschan](https://blueimp.net/)
