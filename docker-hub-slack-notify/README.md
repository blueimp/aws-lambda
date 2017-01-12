# Setup

1. Add the function to [AWS Lambda](https://aws.amazon.com/lambda/).  
   Replace the Slack Webhook path with your own.  
   Choose a basic execution role and the minimum resource values.

2. Create a POST method for an API Resource in
   [AWS API Gateway](https://console.aws.amazon.com/apigateway).  
   Choose the created Lambda function as integration point.  
   Deploy the API on the default stage and copy the invocation URL.

3. Add the invocation URL as Webhook to your
   [Docker Hub](https://hub.docker.com/) repository.
