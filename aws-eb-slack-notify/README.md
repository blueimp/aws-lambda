# Setup

1. Create a new subscription topic on
   [AWS SNS](https://console.aws.amazon.com/sns) and copy the topic ARN.

2. Add the function to [AWS Lambda](https://aws.amazon.com/lambda/).  
   Replace the Slack Webhook path with your own.  
   Choose a basic execution role and the minimum resource values.  
   Add the created SNS topic as event source.

3. Add the SNS Topic ARN to your Elastic Beanstalk configuration,
   e.g. as `.ebextensions/04_sns.config` and deploy it:

```yml
option_settings:
  - namespace: aws:elasticbeanstalk:sns:topics
    option_name: Notification Topic ARN
    value: arn:aws:sns:eu-west-1:0123456789:topic-name
```
