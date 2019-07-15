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

// eslint-disable-next-line node/no-unpublished-require
const AWS = require('aws-sdk')
const https = require('https')

/**
 * Handles the HTTP response
 *
 * @param {*} response HTTP response
 * @param {Function} callback Callback function
 */
function handleResponse(response, callback) {
  const statusCode = response.statusCode
  // eslint-disable-next-line no-console
  console.log('Status code:', statusCode)
  let responseBody = ''
  response
    .on('data', chunk => {
      responseBody += chunk
    })
    .on('end', () => {
      // eslint-disable-next-line no-console
      console.log('Response:', responseBody)
      if (statusCode >= 200 && statusCode < 300) {
        callback(null, 'Request completed successfully.')
      } else {
        callback(new Error(`Request failed with status code ${statusCode}.`))
      }
    })
}

/**
 * Sends an HTTP Post request
 *
 * @param {string} requestURL Request URL
 * @param {object} data Post data
 * @param {Function} callback Callback function
 */
function post(requestURL, data, callback) {
  const body = JSON.stringify(data)
  const options = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  }
  // eslint-disable-next-line no-console
  console.log('Request url:', requestURL)
  // eslint-disable-next-line no-console
  console.log('Request options:', JSON.stringify(options))
  // eslint-disable-next-line no-console
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

/**
 * Builds the request URL for the given build pipeline
 *
 * @param {string} pipeline Build pipeline
 * @returns {string} Request URL
 */
function buildRequestURL(pipeline) {
  return `https://api.buildkite.com/v2/organizations/${ENV.organization}/pipelines/${pipeline}/builds`
}

/**
 * Builds the request data for the given event
 *
 * @param {*} event Event object
 * @returns {object} Request data object
 */
function buildRequestData(event) {
  return {
    commit: event.commit || 'HEAD',
    branch: event.branch || ENV.branch || 'master',
    message: event.message || ENV.message || ':robot_face: scheduled build',
    author: event.author,
    env: event.env,
    // eslint-disable-next-line camelcase
    meta_data: event.meta_data
  }
}

/**
 * Processes the triggered event
 *
 * @param {*} event Event object
 * @param {*} context Context object (unused)
 * @param {Function} callback Callback function
 */
function processEvent(event, context, callback) {
  // eslint-disable-next-line no-console
  console.log('Event:', JSON.stringify(event))
  const pipeline = event.pipeline || ENV.pipeline
  if (!pipeline) {
    callback(
      new Error('No pipeline set in event data or as environment variable.')
    )
    return
  }
  const url = buildRequestURL(pipeline)
  const data = buildRequestData(event)
  post(url, data, callback)
}

/**
 * Decrypts the secrets and processes the triggered event
 *
 * @param {*} event Event object
 * @param {*} context Context object (unused)
 * @param {Function} callback Callback function
 */
function decryptAndProcess(event, context, callback) {
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
