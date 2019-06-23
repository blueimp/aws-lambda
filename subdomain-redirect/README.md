# subdomain-redirect
[AWS Lambda](https://aws.amazon.com/lambda/) function to redirect a domain to
its subdomain or parent domain.  
Meant to be used with [Amazon API Gateway](https://aws.amazon.com/api-gateway/).

## Setup

### Function configuration
Add the function code to AWS Lambda with the following configuration options:  

Key     | Value
--------|--------------
Runtime | Node.js 10.x
Handler | index.handler
Role    | AWSLambdaBasicExecutionRole
Memory  | 128 (MB)
Timeout | 3 sec

### Environment variables
Set the following optional environment variables for the Lambda function:

Key    | Value
-------|--------------
label  | The DNS label of the subdomain, defaults to `"www"`.
status | The status code of the response, defaults to `302`.
scheme | The scheme of the redirect URL, defaults to `"https"`.
hsts   | The value for the `HSTS` header, by default empty.
type   | The value for the `Content-Type` header, defaults to `"text/html"`.

### Certificate Manager configuration
Select the `US East (N. Virginia)` region, request a certificate for your custom
domain with both the wildcard and naked domain - e.g. `*.example.org` and
`example.org` - and confirm the email request.

### API Gateway configuration
1. Create a new API in [Amazon API Gateway](https://aws.amazon.com/api-gateway/)
   with the name `subdomain-redirect`.
3. Select `Resources => Actions => Create Method` and choose `ANY` as HTTP
   method. Enable `Use Lambda Proxy integration`, choose your lambda region,
   enter the function name (`subdomain-redirect`) and save the method.
3. Select `Resources => Actions => Create Resource`, enable
   `Configure as proxy resource` and click on `Create Resource`. Choose your
   lambda region, enter the function name (`subdomain-redirect`) and save the
   method.
4. Next, deploy the API via `Resources => Actions => Deploy API` with `prod` as
   new stage name.
5. Create a custom domain name. Enter the naked domain (e.g. `example.org`) if
   you want to redirect to the `www` subdomain. Enter the subdomain
   (e.g. `www.example.org`) if you want to redirect to the parent domain. Add a
   base path mapping to the `subdomain-redirect` API with the `Path` empty and
   the stage set to `prod` and save the custom domain.

### Route53 configuration
In [Amazon Route 53](https://aws.amazon.com/route53/) in your hosted zone,
create a new record for your custom domain. Set the `Type` to `A`, `Alias` to
`Yes` and set the `Alias Target` to the `Target Domain Name` from the custom
domain setup in API Gateway.

## License
Released under the [MIT license](https://opensource.org/licenses/MIT).

## Author
[Sebastian Tschan](https://blueimp.net/)
