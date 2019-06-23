# ssh-authorized-keys
[AWS Lambda](https://aws.amazon.com/lambda/) function to return authorized keys
for EC2 SSH access.  
Meant to be used with [Amazon API Gateway](https://aws.amazon.com/api-gateway/).

## Setup

### IAM group creation
Create a new [IAM](https://aws.amazon.com/iam/) group and label it e.g. `ssh`.  
Attach the managed policy `IAMUserSSHKeys` and add all users that should be
granted EC2 SSH access.

### IAM role creation
Create a new [IAM](https://aws.amazon.com/iam/) role with the name
`aws-lambda-ssh-authorized-keys`. Select the AWS Lambda role type and attach the
managed policy `AWSLambdaBasicExecutionRole`.  
Attach an additional inline policy with the following content, optionally
replacing `ssh` with the IAM group created in the previous section.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "iam:getGroup",
        "iam:listSSHPublicKeys",
        "iam:getSSHPublicKey"
      ],
      "Resource":[
        "arn:aws:iam::*:group/ssh",
        "arn:aws:iam::*:user/*"
      ]
    }
  ]
}
```

### Function configuration
Add the function code to AWS Lambda with the following configuration options:  

Key     | Value
--------|--------------
Runtime | Node.js 10.x
Handler | index.handler
Role    | aws-lambda-ssh-authorized-keys
Memory  | 128 (MB)
Timeout | 10 sec

### Environment variables
Set the following optional environment variable for the Lambda function:

Key   | Value
------|--------------
group | The IAM group of users authorized for SSH access, defaults to ``"ssh"``.

### Trigger configuration
Add an API Gateway trigger with "Open" security.  
No API key is necessary, as the returned keys are public by definition.

#### Enable API Gateway Caching
1. Go to the API Gateway console.
2. Navigate to the Stage Editor for the `prod` stage.
3. Choose `Settings`.
4. Select `Enable API cache`.
5. Set the `Cache capacity` to `0.5GB`.
6. Set the `Cache time-to-live (TTL)` to `300` (5 mins).

### EC2 configuration
Use the following
[EC2 user data shell script](http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/user-data.html#user-data-shell-scripts)
when launching your instances, replacing `ID` with the API Gateway ID of your
lambda function and `REGION` with your AWS region in the curl URL:

```sh
#!/bin/sh

# Add the ssh-authorized-keys command:
# shellcheck disable=SC2016,SC1004
echo '#!/bin/sh
[ "$1" = ec2-user ] && exec curl -s \
https://ID.execute-api.REGION.amazonaws.com/prod/ssh-authorized-keys
' > /usr/local/bin/ssh-authorized-keys && chmod +x \
    /usr/local/bin/ssh-authorized-keys

# Configure sshd to lookup public keys via ssh-authorized-keys command:
sed -i '/^AuthorizedKeysCommand/d' /etc/ssh/sshd_config
echo '
AuthorizedKeysCommand /usr/local/bin/ssh-authorized-keys
AuthorizedKeysCommandUser nobody
' >> /etc/ssh/sshd_config

# Check and reload the sshd config:
sshd -t && service sshd reload
```

## License
Released under the [MIT license](https://opensource.org/licenses/MIT).

## Author
[Sebastian Tschan](https://blueimp.net/)
