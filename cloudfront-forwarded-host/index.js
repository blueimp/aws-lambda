/*
 * AWS Lambda@Edge function to forward the Host header as X-Forwarded-Host.
 * https://github.com/blueimp/aws-lambda
 *
 * Copyright 2017, Sebastian Tschan
 * https://blueimp.net
 *
 * Licensed under the MIT license:
 * https://opensource.org/licenses/MIT
 */

'use strict'

exports.handler = (event, context, callback) => {
  const request = event.Records[0].cf.request
  request.headers['x-forwarded-host'] = [
    { key: 'X-Forwarded-Host', value: request.headers.host[0].value }
  ]
  return callback(null, request)
}
