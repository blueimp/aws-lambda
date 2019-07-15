/*
 * AWS Lambda function to redirect a domain to its subdomain or parent domain.
 * https://github.com/blueimp/aws-lambda
 *
 * Optional environment variables:
 * - label:  The DNS label of the subdomain, defaults to "www".
 * - status: The status code of the response, defaults to 302.
 * - scheme: The scheme of the redirect URL, defaults to "https".
 * - hsts:   The value for the HSTS header, by default empty.
 * - type:   The value for the Content-Type header, defaults to "text/html".
 *
 * Copyright 2017, Sebastian Tschan
 * https://blueimp.net
 *
 * Licensed under the MIT license:
 * https://opensource.org/licenses/MIT
 */

'use strict'

const env = process.env
const label = env.label || 'www'
const regexp = new RegExp(`^${label}\\.`)
const statusCode = Number(env.status) || 302
const scheme = env.scheme || 'https'
const hsts = env.hsts
const contentType = env.type || 'text/html'

exports.handler = (event, context, callback) => {
  // eslint-disable-next-line no-console
  console.log('Event:', JSON.stringify(event))
  const host = event.headers.Host
  // If the subdomain matches, redirect to the parent domain.
  // If there is no match, redirect to the subdomain:
  const redirectHost = regexp.test(host)
    ? host.slice(label.length + 1)
    : `${label}.${host}`
  const params = event.queryStringParameters
  const queryString = params
    ? '?' +
      Object.keys(params)
        .map(key => {
          return `${key}=${encodeURIComponent(params[key])}`
        })
        .join('&')
    : ''
  const location = `${scheme}://${redirectHost}${event.path}${queryString}`
  const response = {
    statusCode,
    headers: { location, 'content-type': contentType }
  }
  if (hsts) response.headers['strict-transport-security'] = hsts
  // eslint-disable-next-line no-console
  console.log('Response:', JSON.stringify(response))
  callback(null, response)
}
