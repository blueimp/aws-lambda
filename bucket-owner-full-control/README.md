# bucket-owner-full-control

[AWS Lambda](https://aws.amazon.com/lambda/) function to grant the bucket owner
full control over an S3 object.

## Setup

### Prerequisites

This setup assumes two AWS accounts. The main account (`Account A`) grants
another account (`Account B`) access to an S3 bucket via
[bucket policy](http://docs.aws.amazon.com/AmazonS3/latest/dev/example-bucket-policies.html),
e.g. the following:

```json
{
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::ACCOUNT_ID:root"
      },
      "Action": "s3:*",
      "Resource": ["arn:aws:s3:::BUCKET_NAME", "arn:aws:s3:::BUCKET_NAME/*"]
    }
  ]
}
```

Ideally this bucket policy would restrict S3 uploads to always set the
`bucket-owner-full-control`
[canned ACL](http://docs.aws.amazon.com/AmazonS3/latest/dev/acl-overview.html#canned-acl).

A sample bucket policy with this restriction would be the following:

```json
{
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::ACCOUNT_ID:root"
      },
      "Action": "s3:*",
      "Resource": ["arn:aws:s3:::BUCKET_NAME", "arn:aws:s3:::BUCKET_NAME/*"]
    },
    {
      "Effect": "Deny",
      "Principal": {
        "AWS": "arn:aws:iam::ACCOUNT_ID:root"
      },
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::BUCKET_NAME/*",
      "Condition": {
        "StringNotEquals": {
          "s3:x-amz-acl": "bucket-owner-full-control"
        }
      }
    }
  ]
}
```

A sample
[s3 put-object](http://docs.aws.amazon.com/cli/latest/reference/s3api/put-object.html)
command with the required `bucket-owner-full-control` ACL as argument:

```sh
aws s3api put-object \
  --bucket BUCKET_NAME \
  --key test.txt \
  --body test.txt \
  --acl bucket-owner-full-control
```

In cases where this is not possible, e.g. when allowing uploads with an S3
application like [Cyberduck](https://cyberduck.io/), this Lambda function comes
in handy.

### IAM roles creation

In `Account B`, create a new cross-account [IAM](https://aws.amazon.com/iam/)
role. Fill in the account ID of `Account A` as account that can use this role.
As role name, choose `bucket-owner-full-control-role`.

After creating the role, attach the following inline policy, replacing
`BUCKET_NAME` with the name of your bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:PutObjectAcl",
      "Condition": {
        "StringEquals": {
          "s3:x-amz-acl": "bucket-owner-full-control"
        }
      },
      "Resource": "arn:aws:s3:::BUCKET_NAME/*"
    }
  ]
}
```

In `Account A`, create a new Lambda service role with the managed
`AWSLambdaBasicExecutionRole` attached. As role name choose
`aws-lambda-bucket-owner-role`.

After creating the role, attach the following inline policy, replacing
`ACCOUNT_ID` with the account ID of `Account B`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::ACCOUNT_ID:role/bucket-owner-full-control-role"
    }
  ]
}
```

### Function configuration

Add the function code to AWS Lambda with the following configuration options:

| Key     | Value                        |
| ------- | ---------------------------- |
| Runtime | Node.js 10.x                 |
| Handler | index.handler                |
| Role    | aws-lambda-bucket-owner-role |
| Memory  | 128 (MB)                     |
| Timeout | 3 sec                        |

### Environment variables

Set the following required environment variable for the Lambda function:

| Key     | Value                                                           |
| ------- | --------------------------------------------------------------- |
| rolearn | The ARN of the `bucket-owner-full-control-role` of `Account B`. |

### Trigger configuration

Add an `S3` trigger for your bucket with the `PUT` event type.  
[test-event.json](test-event.json) contains a sample S3 PUT event.

## License

Released under the [MIT license](https://opensource.org/licenses/MIT).

## Author

[Sebastian Tschan](https://blueimp.net/)
