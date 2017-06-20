/*
 * CloudWatch Logs to Elasticsearch streaming function for AWS Lambda
 * https://github.com/blueimp/aws-lambda
 *
 * Required environment variables:
 * - hostname:    Hostname of the Elasticsearch cluster HTTPS endpoint.
 * - port:        Port number of the Elasticsearch cluster HTTPS endpoint.
 * - username:    Name of an ES user with create_index and write permissions.
 * - encpass:     AWS KMS encrypted password for the ES user.
 *
 * Optional environment variables:
 * - pipeline:    The Elasticsearch ingest pipeline to use.
 * - piperegexp:  RegExp matched with the log group if the pipeline applies.
 * - pipefields:  Required fields for the pipeline to add if missing, e.g.:
 *                http_user_agent= real_ip=127.0.0.1
 *
 * Copyright 2016, Sebastian Tschan
 * https://blueimp.net
 *
 * Licensed under the MIT license:
 * https://opensource.org/licenses/MIT
 */

'use strict'

const ENV = process.env
;['hostname', 'port', 'username', 'encpass'].forEach(key => {
  if (!ENV[key]) throw new Error(`Missing environment variable: ${key}`)
})

const PIPELINE_REGEXP = new RegExp(ENV.piperegexp || '.')
const PIPELINE_FIELDS = ENV.pipefields
  ? ENV.pipefields.split(' ').map(f => f.split('='))
  : []

let password

const AWS = require('aws-sdk')
const zlib = require('zlib')
const https = require('https')

function extractJSON (message) {
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
    let obj = extractJSON(value)
    if (obj) {
      source['$' + key] = obj
    }
    source[key] = value
  })
  return source
}

function addMissingPipelineFields (source) {
  PIPELINE_FIELDS.forEach(field => {
    let key = field[0]
    if (source[key]) return
    let value = field[1]
    if (isNumeric(value)) {
      source[key] = 1 * value
      return
    }
    source[key] = value
  })
}

function buildAction (logEvent, payload, index) {
  return {
    index: {
      _index: index,
      _type: payload.logGroup,
      _id: logEvent.id
    }
  }
}

function buildSource (logEvent, payload, hasPipeline) {
  const source = logEvent.extractedFields
    ? buildExtractedSource(logEvent.extractedFields)
    : extractJSON(logEvent.message) || {}
  if (hasPipeline) addMissingPipelineFields(source)
  source['@id'] = logEvent.id
  source['@timestamp'] = new Date(1 * logEvent.timestamp).toISOString()
  source['@message'] = logEvent.message
  source['@owner'] = payload.owner
  source['@log_group'] = payload.logGroup
  source['@log_stream'] = payload.logStream
  return source
}

function transform (payload, hasPipeline) {
  let bulkRequestBody = ''
  const index = payload.logGroup
                  .replace(/\W+|_+/g, '-')
                  .replace(/^\-/, '')
                  .toLowerCase()
  payload.logEvents.forEach(logEvent => {
    bulkRequestBody += [
      JSON.stringify(buildAction(logEvent, payload, index)),
      JSON.stringify(buildSource(logEvent, payload, hasPipeline))
    ].join('\n') + '\n'
  })
  return bulkRequestBody
}

function handleResponse (response, callback) {
  const statusCode = response.statusCode
  console.log('Status code:', statusCode)
  let responseBody = ''
  response
    .on('data', chunk => { responseBody += chunk })
    .on('end', chunk => {
      console.log('Response:', responseBody)
      if (statusCode >= 200 && statusCode < 300) {
        const result = JSON.parse(responseBody)
        const items = result.items
        const failed = items.reduce((num, item) => {
          return item.index.status >= 300 ? ++num : num
        }, 0)
        console.log('Successful items:', items.length - failed)
        console.log('Failed items:', failed)
        if (result.errors || failed) {
          return callback(
            new Error(`Request failed for ${failed} of ${items.length} items.`)
          )
        }
      } else {
        return callback(
          new Error(`Request failed with status code ${statusCode}.`)
        )
      }
      callback(null, 'Request completed successfully.')
    })
}

function queryString (hasPipeline) {
  return hasPipeline ? '?pipeline=' + ENV.pipeline : ''
}

function post (path, body, callback) {
  console.log('Request URL:', `https://${ENV.hostname}:${ENV.port}${path}`)
  const options = {
    hostname: ENV.hostname,
    port: ENV.port,
    path: path,
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
    const hasPipeline = ENV.pipeline &&
      PIPELINE_REGEXP.test(decodedPayload.logGroup)
    const transformedPayload = transform(decodedPayload, hasPipeline)
    console.log('Transformed payload:', transformedPayload.replace(/\n/g, ' '))
    post('/_bulk' + queryString(hasPipeline), transformedPayload, callback)
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
