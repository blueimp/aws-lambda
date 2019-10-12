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

// eslint-disable-next-line node/no-unpublished-require
const AWS = require('aws-sdk')
const zlib = require('zlib')
const https = require('https')

/**
 * Extracts JSON from the given message string
 *
 * @param {string} message Message string
 * @returns {object} Message object
 */
function extractJSON(message) {
  const jsonStart = message.indexOf('{')
  if (jsonStart < 0) return null
  try {
    return JSON.parse(message.substring(jsonStart))
  } catch (e) {
    return null
  }
}

/**
 * Tests if the given string is numeric
 *
 * @param {string} n Input string
 * @returns {boolean} Returns true if the given string is numeric
 */
function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n)
}

/**
 * Builds an extracted source object from the given extracted fields
 *
 * @param {object} extractedFields Extracted fields object
 * @returns {object} Extracted source object
 */
function buildExtractedSource(extractedFields) {
  const source = {}
  Object.keys(extractedFields).forEach(key => {
    const value = extractedFields[key]
    if (!value) return
    if (isNumeric(value)) {
      source[key] = 1 * value
      return
    }
    const obj = extractJSON(value)
    if (obj) {
      source['$' + key] = obj
    }
    source[key] = value
  })
  return source
}

/**
 * Adds missing pipeline fields to the given source object
 *
 * @param {object} source Source object
 */
function addMissingPipelineFields(source) {
  PIPELINE_FIELDS.forEach(field => {
    const key = field[0]
    if (source[key]) return
    const value = field[1]
    if (isNumeric(value)) {
      source[key] = 1 * value
      return
    }
    source[key] = value
  })
}

/**
 * Builds an action object from the given arguments
 *
 * @param {*} logEvent Log event
 * @param {*} payload Payload (unused)
 * @param {string} index Log index
 * @returns {object} Action object
 */
function buildAction(logEvent, payload, index) {
  return {
    index: {
      _index: index,
      _type: index,
      _id: logEvent.id
    }
  }
}

/**
 * Builds a source object from the given arguments
 *
 * @param {*} logEvent Log event
 * @param {*} payload Payload (unused)
 * @param {boolean} hasPipeline Has pipeline?
 * @returns {object} Source object
 */
function buildSource(logEvent, payload, hasPipeline) {
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

/**
 * Transforms the payload into a request body
 *
 * @param {*} payload Payload
 * @param {boolean} hasPipeline Has pipeline?
 * @returns {string} Request body
 */
function transform(payload, hasPipeline) {
  let bulkRequestBody = ''
  const index = ENV.index ? ENV.index : payload.logGroup
    .replace(/\W+|_+/g, '-')
    .replace(/^-/, '')
    .toLowerCase()
  payload.logEvents.forEach(logEvent => {
    bulkRequestBody +=
      [
        JSON.stringify(buildAction(logEvent, payload, index)),
        JSON.stringify(buildSource(logEvent, payload, hasPipeline))
      ].join('\n') + '\n'
  })
  return bulkRequestBody
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
        const result = JSON.parse(responseBody)
        const items = result.items
        const failed = items.reduce((num, item) => {
          // eslint-disable-next-line no-param-reassign
          return item.index.status >= 300 ? ++num : num
        }, 0)
        // eslint-disable-next-line no-console
        console.log('Successful items:', items.length - failed)
        // eslint-disable-next-line no-console
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

/**
 * Builds the query string
 *
 * @param {boolean} hasPipeline Has pipeline?
 * @returns {string} Query string
 */
function queryString(hasPipeline) {
  return hasPipeline ? '?pipeline=' + ENV.pipeline : ''
}

/**
 * Sends an HTTP Post request
 *
 * @param {string} path Request path
 * @param {object} body Post data
 * @param {Function} callback Callback function
 */
function post(path, body, callback) {
  // eslint-disable-next-line no-console
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
  https
    .request(options, response => {
      handleResponse(response, callback)
    })
    .on('error', err => {
      callback(err)
    })
    .end(body)
}

/**
 * Processes the triggered event
 *
 * @param {*} event Event object
 * @param {*} context Context object (unused)
 * @param {Function} callback Callback function
 */
function processEvent(event, context, callback) {
  const payload = Buffer.from(event.awslogs.data, 'base64')
  zlib.gunzip(payload, (err, res) => {
    if (err) return callback(err)
    const decodedPayload = JSON.parse(res.toString('utf8'))
    // eslint-disable-next-line no-console
    console.log('Decoded payload:', JSON.stringify(decodedPayload))
    if (decodedPayload.messageType === 'CONTROL_MESSAGE') {
      return callback(null, 'Control message handled successfully.')
    }
    const hasPipeline =
      ENV.pipeline && PIPELINE_REGEXP.test(decodedPayload.logGroup)
    const transformedPayload = transform(decodedPayload, hasPipeline)
    // eslint-disable-next-line no-console
    console.log('Transformed payload:', transformedPayload.replace(/\n/g, ' '))
    post('/_bulk' + queryString(hasPipeline), transformedPayload, callback)
  })
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
  const enc = { CiphertextBlob: Buffer.from(ENV.encpass, 'base64') }
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
