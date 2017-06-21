# authorize-ip
[AWS Lambda](https://aws.amazon.com/lambda/) function to authorize the
client IP for an EC2 security group.  
Meant to be used with [Amazon API Gateway](https://aws.amazon.com/api-gateway/).

## Setup

### IAM role creation
Create a new [IAM](https://aws.amazon.com/iam/) role with the name
`aws-lambda-authorize-ip-role`. Select the AWS Lambda role type and attach the
managed policy `AWSLambdaBasicExecutionRole`.  
Attach an additional inline policy with the following content, replacing
`REGION`, `ACCOUNT_ID` and `GROUP_ID` with your desired values:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:AuthorizeSecurityGroupIngress"
      ],
      "Resource": [
        "arn:aws:ec2:REGION:ACCOUNT_ID:security-group/GROUP_ID"
      ]
    }
  ]
}
```

### Function configuration
Add the function code to AWS Lambda with the following configuration options:  

Key     | Value
--------|--------------
Runtime | Node.js 6.10
Handler | index.handler
Role    | aws-lambda-authorize-ip-role
Memory  | 128 (MB)
Timeout | 3 sec

### Environment variables
Set the following required environment variables for the Lambda function:

Key      | Value
---------|--------------
groupid  | The ID of the security group, e.g. ``"sg-xxxxxxxx"``.

Set the following optional environment variables for the Lambda function:

Key      | Value
---------|--------------
protocol | The protocol to authorize, defaults to ``"tcp"``.
port     | The port to authorize, defaults to `22` (SSH).

### Trigger configuration
Add an API Gateway trigger, e.g. with API Key security.

## License
Released under the [MIT license](https://opensource.org/licenses/MIT).

## Author
[Sebastian Tschan](https://blueimp.net/)
