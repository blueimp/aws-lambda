# cloudwatch-events-to-buildkite
[Amazon CloudWatch](https://aws.amazon.com/cloudwatch/) Events to
[BuildKite](https://buildkite.com/) trigger function for
[AWS Lambda](https://aws.amazon.com/lambda/).

## Setup

### Function configuration
Add the function code to AWS Lambda with the following configuration options:  

Key     | Value
--------|--------------
Runtime | Node.js 6.10
Handler | index.handler
Role    | AWSLambdaBasicExecutionRole
Memory  | 128 (MB)
Timeout | 3 sec
KMS key | aws/lambda

### Environment variables
Set the following required environment variables for the Lambda function:

Key          | Value
-------------|--------------
token        | [AWS KMS](https://aws.amazon.com/kms/) encrypted access token.
organization | BuildKite organization slug.

Set the following optional environment variables for the Lambda function:

Key          | Value
-------------|--------------
pipeline     | BuildKite pipeline slug (used if `event.pipeline` is empty).
branch       | Git branch to build (*default:* `master`).
message      | Build message (*default:* `:robot_face: scheduled build`).

### Trigger configuration
1. In the Amazon CloudWatch `Events => Rules` section, click on `Create rule`.
2. Choose `Schedule` as event source.
3. Select the created Lambda function as target.
4. Click on `Configure input` and select `Constant (JSON text)`.
5. Enter the desired event data as `JSON` object, e.g. `{"pipeline":"example"}`.
6. Click on `Configure details` and enter a name and description.
7. Save the rule via `Create rule`.

The event data is sent as POST data to the
[BuildKite API](https://buildkite.com/docs/rest-api/builds#create-a-build).  
In addition, the event data supports a `pipeline` property that overrides a
configured environment variable.

The required request body properties are set to the following default values if
not provided via event data:

Key     | Value
--------|--------------
commit  | `HEAD`
branch  | `master`
message | `:robot_face: scheduled build`

## License
Released under the [MIT license](https://opensource.org/licenses/MIT).

## Author
[Sebastian Tschan](https://blueimp.net/)
