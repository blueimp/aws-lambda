/*
 * AWS Lambda function to authorize the client IP for an EC2 security group.
 * https://github.com/blueimp/aws-lambda
 *
 * Required environment variables:
 * - groupid:  The ID of the security group, e.g. "sg-xxxxxxxx".
 *
 * Optional environment variables:
 * - protocol: The protocol to authorize, defaults to "tcp".
 * - port:     The port to authorize, defaults to 22 (SSH).
 *
 * Meant to be used with Amazon API Gateway, which sets the following property:
 * - event.requestContext.identity.sourceIp
 *
 * Copyright 2017, Sebastian Tschan
 * https://blueimp.net
 *
 * Licensed under the MIT license:
 * http://opensource.org/licenses/MIT
 */

'use strict'

const ENV = process.env
if (!ENV.groupid) throw new Error('Missing environment variable: groupid')

const AWS = require('aws-sdk')
const EC2 = new AWS.EC2()

function authorizeIP (ip, callback) {
  const networkMask = ip.indexOf(':') > -1 ? '/128' : '/32'
  const params = {
    GroupId: ENV.groupid,
    IpProtocol: ENV.protocol || 'tcp',
    FromPort: ENV.port || 22,
    ToPort: ENV.port || 22,
    CidrIp: ip + networkMask
  }
  EC2.authorizeSecurityGroupIngress(params, (err, data) => {
    if (err) {
      if (err.code === 'InvalidPermission.Duplicate') {
        console.log('IP already authorized:', ip)
      } else {
        return callback(err)
      }
    } else {
      console.log('IP newly authorized:', ip)
    }
    const response = {
      statusCode: 200,
      headers: {},
      body: JSON.stringify({ip})
    }
    callback(null, response)
  })
}

exports.handler = (event, context, callback) => {
  console.log('Event:', JSON.stringify(event))
  const ip = event.requestContext.identity.sourceIp
  authorizeIP(ip, callback)
}
