/*
 * AWS Lambda@Edge function to add common security headers for CloudFront.
 * https://github.com/blueimp/aws-lambda
 *
 * Copyright 2017, Sebastian Tschan
 * https://blueimp.net
 *
 * Licensed under the MIT license:
 * https://opensource.org/licenses/MIT
 */

'use strict'

const headers = {
  // Instruct browsers to only interact with the site via HTTPS:
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  // Pinned SSL keys are the intermediate certificate in use and a backup key:
  // 1. Amazon intermediate: "s:/C=US/O=Amazon/OU=Server CA 1B/CN=Amazon"
  // 2. Let’s Encrypt Authority X1 (IdenTrust cross-signed)
  'Public-Key-Pins':
    'pin-sha256="JSMzqOOrtyOT1kmau6zKhgT676hGgczD5VMdRMyJZFA="; ' +
    'pin-sha256="YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2Fuihg="; ' +
    'max-age=2592000; includeSubDomains',
  // Require HTTPS for resource loading, allow inline code, disable plugins:
  'Content-Security-Policy':
    "default-src https: 'unsafe-inline'; " +
    'img-src https: data:; ' +
    "object-src 'none'; " +
    "frame-ancestors 'self';",
  // Only allow frame embedding on the same origin:
  'X-Frame-Options': 'SAMEORIGIN',
  // Only transmit the origin cross-domain and no referer without HTTPS:
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Instruct browsers to strictly follow the Content-Type header:
  'X-Content-Type-Options': 'nosniff',
  // Enable browser XSS protections:
  'X-XSS-Protection': '1; mode=block'
}

// Transform the headers to CloudFronts key value array format:
const transformedHeaders = {}
Object.keys(headers).forEach(key => {
  transformedHeaders[key.toLowerCase()] = [{key, value: headers[key]}]
})

exports.handler = (event, context, callback) => {
  const response = event.Records[0].cf.response
  Object.assign(response.headers, transformedHeaders)
  callback(null, response)
}
