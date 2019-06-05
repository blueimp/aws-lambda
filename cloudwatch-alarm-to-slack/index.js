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

const AWS = require('aws-sdk')
const https = require('https')

const statusColors = {
  ALARM: 'danger',
  INSUFFICIENT_DATA: 'warning',
  OK: 'good'
}

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

function buildSlackMessage (data) {
  return {
    channel: ENV.channel,
    username: ENV.username,
    icon_emoji: ENV.icon_emoji,
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

function parseSNSMessage (message) {
  console.log('SNS Message:', message)
  return JSON.parse(message)
}

function processEvent (event, context, callback) {
  console.log('Event:', JSON.stringify(event))
  const snsMessage = parseSNSMessage(event.Records[0].Sns.Message)
  const postData = buildSlackMessage(snsMessage)
  post(webhook, postData, callback)
}

function decryptAndProcess (event, context, callback) {
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
