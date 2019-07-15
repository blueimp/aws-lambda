/*
 * CloudWatch alarm notifications to Slack streaming function for AWS Lambda.
 * https://github.com/blueimp/aws-lambda
 *
 * Required environment variables:
 * - webhook:     AWS KMS encrypted Slack WebHook URL.
 *
 * Optional environment variables:
 * - channel:     Slack channel to send the messages to.
 * - username:    Bot username used for the slack messages.
 * - icon_emoji:  Bot icon emoji used for the slack messages.
 * - icon_url:    Bot icon url used for the slack messages.
 *
 * Copyright 2017, Sebastian Tschan
 * https://blueimp.net
 *
 * Licensed under the MIT license:
 * https://opensource.org/licenses/MIT
 */

'use strict'

const ENV = process.env
if (!ENV.webhook) throw new Error('Missing environment variable: webhook')

let webhook

// eslint-disable-next-line node/no-unpublished-require
const AWS = require('aws-sdk')
const https = require('https')

const statusColors = {
  ALARM: 'danger',
  INSUFFICIENT_DATA: 'warning',
  OK: 'good'
}

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
 * Builds a Slack message object from the given message data
 *
 * @param {object} data Message data
 * @returns {object} Slack message object
 */
function buildSlackMessage(data) {
  return {
    channel: ENV.channel,
    username: ENV.username,
    // eslint-disable-next-line camelcase
    icon_emoji: ENV.icon_emoji,
    // eslint-disable-next-line camelcase
    icon_url: ENV.icon_url,
    attachments: [
      {
        fallback: data.AlarmName,
        title: data.AlarmName,
        text: data.AlarmDescription,
        color: statusColors[data.NewStateValue],
        fields: [
          {
            title: 'Status',
            value: data.NewStateValue,
            short: true
          },
          {
            title: 'Region',
            value: data.Region,
            short: true
          }
        ]
      }
    ]
  }
}

/**
 * Parses the given SNS message
 *
 * @param {string} message SNS message
 * @returns {object} Parsed SNS message object
 */
function parseSNSMessage(message) {
  // eslint-disable-next-line no-console
  console.log('SNS Message:', message)
  return JSON.parse(message)
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
  const snsMessage = parseSNSMessage(event.Records[0].Sns.Message)
  const postData = buildSlackMessage(snsMessage)
  post(webhook, postData, callback)
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
  const enc = { CiphertextBlob: Buffer.from(ENV.webhook, 'base64') }
  kms.decrypt(enc, (err, data) => {
    if (err) return callback(err)
    webhook = data.Plaintext.toString('ascii')
    processEvent(event, context, callback)
  })
}

exports.handler = (event, context, callback) => {
  if (webhook) {
    processEvent(event, context, callback)
  } else {
    decryptAndProcess(event, context, callback)
  }
}
