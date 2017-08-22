# cloudfront-security-headers
[AWS Lambda@Edge](https://aws.amazon.com/lambda/edge/) function to add common
security headers for static content served via CloudFront.

## Setup

### IAM role creation
Create a new [IAM](https://aws.amazon.com/iam/) role with the name
`aws-lambda-edge-execution-role` and the following trust relationship:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": [
          "lambda.amazonaws.com",
          "edgelambda.amazonaws.com"
        ]
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

### Function configuration
Add the function code to AWS Lambda in the `US East (N. Virginia)` region with
the following configuration options:  

Key     | Value
--------|--------------
Runtime | Node.js 6.10
Handler | index.handler
Role    | aws-lambda-edge-execution-role
Memory  | 128 (MB)
Timeout | 3 sec

Next publish a version of the function and copy its
[Lambda Function ARN](http://docs.aws.amazon.com/lambda/latest/dg/versioning-intro.html).

### CloudFront configuration
In the behavior settings of the CloudFront distribution, add a new
**Lambda Function Association** with the **Event Type** `Origin Response` and
the **Lambda Function ARN** copied from the function configuration.  
Save your edits and wait until the new settings have been deployed.

## License
Released under the [MIT license](https://opensource.org/licenses/MIT).

## Author
[Sebastian Tschan](https://blueimp.net/)
