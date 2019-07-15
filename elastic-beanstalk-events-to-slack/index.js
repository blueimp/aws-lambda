/*
 * Elastic Beanstalk events to Slack streaming function for AWS Lambda.
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

const STATUS_TYPES = [
  {
    color: 'good',
    messages: [' to GREEN', ' to Ok', 'New application version was deployed']
  },
  {
    color: 'warning',
    messages: [' to YELLOW', ' to Warning']
  },
  {
    color: 'danger',
    messages: [
      ' to RED',
      ' to Degraded',
      ' to Severe',
      'Unsuccessful command execution',
      'Failed to deploy'
    ]
  }
]

const EXCLUDE_KEYS = [
  'Message',
  'NotificationProcessId',
  'RequestId',
  'Timestamp'
]
const SHORT_KEYS = ['Application', 'Environment']

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
 * Returns the status color for the given data object
 *
 * @param {object} data Data object
 * @returns {string} Color
 */
function getStatusColor(data) {
  const message = data.Message
  if (!message) return
  let color
  STATUS_TYPES.some(type => {
    return type.messages.some(msg => {
      if (message.indexOf(msg) === -1) return false
      color = type.color
      return true
    })
  })
  return color
}

/**
 * Generates attachment fields
 *
 * @param {*} data Data object
 * @returns {Array} Attachment fields
 */
function generateAttachmentFields(data) {
  return Object.keys(data).reduce((fields, key) => {
    if (EXCLUDE_KEYS.indexOf(key) === -1) {
      return [
        ...fields,
        {
          title: key,
          value: data[key],
          short: SHORT_KEYS.indexOf(key) > -1
        }
      ]
    }
    return fields
  }, [])
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
        fallback: data.Message,
        title: data.Message,
        color: getStatusColor(data),
        fields: generateAttachmentFields(data)
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
  const parsedMessage = message.split('\n').reduce((obj, line) => {
    if (line.length) {
      const key = line.split(':', 1)[0]
      const value = line.substr(key.length + 2)
      if (key !== 'Environment URL' || value !== 'http://null') {
        const newObj = Object.assign({}, obj)
        newObj[key] = value
        return newObj
      }
    }
    return obj
  }, {})
  // eslint-disable-next-line no-console
  console.log('Parsed SNS Message:', JSON.stringify(parsedMessage))
  return parsedMessage
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
