/*
 * CloudWatch Logs to Elasticsearch streaming function for AWS Lambda
 * https://github.com/blueimp/aws-lambda
 *
 * Required environment variables:
 * - hostname:  Hostname of the Elasticsearch cluster HTTPS endpoint.
 * - port:      Port number of the Elasticsearch cluster HTTPS endpoint.
 * - username:  Name of an ES user with create_index and write permissions.
 * - encpass:   AWS KMS encrypted password for the ES user.
 *
 * Copyright 2016, Sebastian Tschan
 * https://blueimp.net
 *
 * Licensed under the MIT license:
 * http://opensource.org/licenses/MIT
 */

'use strict'

const ENV = process.env
;['hostname', 'port', 'username', 'encpass'].forEach(key => {
  if (!ENV[key]) throw new Error(`Missing environment variable: ${key}`)
})
let password

const AWS = require('aws-sdk')
const zlib = require('zlib')
const https = require('https')

function extractJson (message) {
  const jsonStart = message.indexOf('{')
  if (jsonStart < 0) return null
  try {
    return JSON.parse(message.substring(jsonStart))
  } catch (e) { return null }
}

function isNumeric (n) {
  return !isNaN(parseFloat(n)) && isFinite(n)
}

function buildExtractedSource (extractedFields) {
  const source = {}
  Object.keys(extractedFields).forEach(key => {
    let value = extractedFields[key]
    if (!value) return
    if (isNumeric(value)) {
      source[key] = 1 * value
      return
    }
    let obj = extractJson(value)
    if (obj) {
      source['$' + key] = obj
    }
    source[key] = value
  })
  return source
}

function buildSource (message, extractedFields) {
  if (extractedFields) return buildExtractedSource(extractedFields)
  return extractJson(message) || {}
}

function transform (payload) {
  let bulkRequestBody = ''
  payload.logEvents.forEach(logEvent => {
    const action = {
      index: {
        _index: payload.logGroup.replace(/\W|_/g, '-').toLowerCase(),
        _type: payload.logGroup,
        _id: logEvent.id
      }
    }
    const source = buildSource(logEvent.message, logEvent.extractedFields)
    source['@id'] = logEvent.id
    source['@timestamp'] = new Date(1 * logEvent.timestamp).toISOString()
    source['@message'] = logEvent.message
    source['@owner'] = payload.owner
    source['@log_group'] = payload.logGroup
    source['@log_stream'] = payload.logStream
    bulkRequestBody += [
      JSON.stringify(action),
      JSON.stringify(source)
    ].join('\n') + '\n'
  })
  return bulkRequestBody
}

function handleResponse (response, callback) {
  let responseBody = ''
  response
    .on('data', chunk => { responseBody += chunk })
    .on('end', chunk => {
      console.log('Response:', responseBody)
      const statusCode = response.statusCode
      if (statusCode >= 200 && statusCode < 299) {
        const result = JSON.parse(responseBody)
        const items = result.items
        const failedItems = items.filter(item => {
          return item.index.status >= 300
        })
        console.log('Successful items:', items.length - failedItems.length)
        console.log('Failed items:', failedItems.length)
        if (result.errors || failedItems.length) {
          return callback(JSON.stringify({statusCode, result}))
        }
      } else {
        return callback(JSON.stringify({statusCode, responseBody}))
      }
      callback(null, 'Request completed successfully.')
    })
}

function post (body, callback) {
  const options = {
    hostname: ENV.hostname,
    port: ENV.port,
    path: '/_bulk',
    method: 'POST',
    auth: `${ENV.username}:${password}`,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  }
  https.request(options, response => { handleResponse(response, callback) })
    .on('error', err => { callback(err) })
    .end(body)
}

function processEvent (event, context, callback) {
  const payload = new Buffer(event.awslogs.data, 'base64')
  zlib.gunzip(payload, (err, res) => {
    if (err) return callback(err)
    const decodedPayload = JSON.parse(res.toString('utf8'))
    console.log('Decoded payload:', JSON.stringify(decodedPayload))
    if (decodedPayload.messageType === 'CONTROL_MESSAGE') {
      return callback(null, 'Control message handled successfully.')
    }
    const transformedPayload = transform(decodedPayload)
    console.log('Transformed payload:', transformedPayload.replace(/\n/g, ' '))
    post(transformedPayload, callback)
  })
}

function decryptAndProcess (event, context, callback) {
  const kms = new AWS.KMS()
  const enc = {CiphertextBlob: new Buffer(ENV.encpass, 'base64')}
  kms.decrypt(enc, (err, data) => {
    if (err) return callback(err)
    password = data.Plaintext.toString('ascii')
    processEvent(event, context, callback)
  })
}

exports.handler = (event, context, callback) => {
  if (password) {
    processEvent(event, context, callback)
  } else {
    decryptAndProcess(event, context, callback)
  }
}
