/*
 * CloudWatch Events to BuildKite trigger function for AWS Lambda.
 * https://github.com/blueimp/aws-lambda
 *
 * Required environment variables:
 * - token:         AWS KMS encrypted BuildKite access token.
 * - organization:  BuildKite organization slug.
 *
 * Optional environment variables:
 * - pipeline:      BuildKite pipeline slug (used if event.pipeline is empty).
 * - branch:        Git branch to build (default: "master").
 * - message:       Build message (default: ":robot_face: scheduled build").
 *
 * Copyright 2017, Sebastian Tschan
 * https://blueimp.net
 *
 * Licensed under the MIT license:
 * https://opensource.org/licenses/MIT
 */

'use strict'

const ENV = process.env
;['token', 'organization'].forEach(key => {
  if (!ENV[key]) throw new Error(`Missing environment variable: ${key}`)
})

let token

const AWS = require('aws-sdk')
const https = require('https')

function handleResponse (response, callback) {
  const statusCode = response.statusCode
  console.log('Status code:', statusCode)
  let responseBody = ''
  response
    .on('data', chunk => {
      responseBody += chunk
    })
    .on('end', chunk => {
      console.log('Response:', responseBody)
      if (statusCode >= 200 && statusCode < 300) {
        callback(null, 'Request completed successfully.')
      } else {
        callback(new Error(`Request failed with status code ${statusCode}.`))
      }
    })
}

function post (requestURL, data, callback) {
  const body = JSON.stringify(data)
  const options = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  }
  console.log('Request url:', requestURL)
  console.log('Request options:', JSON.stringify(options))
  console.log('Request body:', body)
  https
    .request(requestURL, options, response => {
      handleResponse(response, callback)
    })
    .on('error', err => {
      callback(err)
    })
    .end(body)
}

function buildRequestURL (pipeline) {
  return `https://api.buildkite.com/v2/organizations/${
    ENV.organization
  }/pipelines/${pipeline}/builds`
}

function buildRequestData (event) {
  return {
    commit: event.commit || 'HEAD',
    branch: event.branch || ENV.branch || 'master',
    message: event.message || ENV.message || ':robot_face: scheduled build',
    author: event.author,
    env: event.env,
    meta_data: event.meta_data
  }
}

function processEvent (event, context, callback) {
  console.log('Event:', JSON.stringify(event))
  const pipeline = event.pipeline || ENV.pipeline
  if (!pipeline) {
    return callback(
      new Error('No pipeline set in event data or as environment variable.')
    )
  }
  const url = buildRequestURL(pipeline)
  const data = buildRequestData(event)
  post(url, data, callback)
}

function decryptAndProcess (event, context, callback) {
  const kms = new AWS.KMS()
  const enc = { CiphertextBlob: Buffer.from(ENV.token, 'base64') }
  kms.decrypt(enc, (err, data) => {
    if (err) return callback(err)
    token = data.Plaintext.toString('ascii')
    processEvent(event, context, callback)
  })
}

exports.handler = (event, context, callback) => {
  if (token) {
    processEvent(event, context, callback)
  } else {
    decryptAndProcess(event, context, callback)
  }
}
