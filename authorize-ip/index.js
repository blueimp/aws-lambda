/*
 * AWS Lambda function to authorize the client IP for an EC2 security group.
 * https://github.com/blueimp/aws-lambda
 *
 * Required environment variables:
 * - groupid:  The ID of the security group, e.g. "sg-xxxxxxxx".
 *
 * Optional environment variables:
 * - protocol:     The protocol to authorize, defaults to "tcp".
 * - port:         The port to authorize, defaults to 22 (SSH).
 * - description:  Description for the inbound rule, defaults to "authorize-ip".
 * - keepipranges: Comma-separated IP ranges to exclude from cleanup.
 *
 * Meant to be used with Amazon API Gateway, which sets the following property:
 * - event.requestContext.identity.sourceIp
 *
 * Copyright 2017, Sebastian Tschan
 * https://blueimp.net
 *
 * Licensed under the MIT license:
 * https://opensource.org/licenses/MIT
 */

'use strict'

const ENV = process.env
if (!ENV.groupid) throw new Error('Missing environment variable: groupid')

const PROTOCOL = ENV.protocol || 'tcp'
const PORT = ENV.port || 22
const DESCRIPTION = ENV.description || 'authorize-ip'

const AWS = require('aws-sdk')
const EC2 = new AWS.EC2()

function authorizeIP (ip) {
  const permission = {
    IpProtocol: PROTOCOL,
    FromPort: PORT,
    ToPort: PORT
  }
  if (ip.indexOf(':') > -1) {
    permission.Ipv6Ranges = [
      {
        Description: DESCRIPTION,
        CidrIpv6: ip + '/128'
      }
    ]
  } else {
    permission.IpRanges = [
      {
        Description: DESCRIPTION,
        CidrIp: ip + '/32'
      }
    ]
  }
  const params = {
    GroupId: ENV.groupid,
    IpPermissions: [permission]
  }
  return new Promise((resolve, reject) => {
    EC2.authorizeSecurityGroupIngress(params)
      .promise()
      .then(data => {
        console.log('IP newly authorized:', ip)
        resolve({ ip })
      })
      .catch(err => {
        if (err.code === 'InvalidPermission.Duplicate') {
          console.log('IP already authorized:', ip)
          return resolve({ ip })
        }
        reject(err)
      })
  })
}

function cleanupIPs () {
  const params = {
    GroupIds: [ENV.groupid],
    Filters: [
      {
        Name: 'ip-permission.protocol',
        Values: [PROTOCOL]
      },
      {
        Name: 'ip-permission.from-port',
        Values: [PORT.toString()]
      },
      {
        Name: 'ip-permission.to-port',
        Values: [PORT.toString()]
      }
    ]
  }
  return EC2.describeSecurityGroups(params)
    .promise()
    .then(data => {
      const ipPermissions = data.SecurityGroups.length
        ? data.SecurityGroups[0].IpPermissions
        : []
      console.log('IP permissions:', JSON.stringify(ipPermissions))
      if (!ipPermissions.length) return null
      const keepIpRanges = (ENV.keepipranges || '').split(',')
      const revokeIpPermissions = ipPermissions.reduce((permissions, perm) => {
        const IpRanges = perm.IpRanges.filter(
          ipRange => !keepIpRanges.includes(ipRange.CidrIp)
        )
        const Ipv6Ranges = perm.Ipv6Ranges.filter(
          ipv6Range => !keepIpRanges.includes(ipv6Range.CidrIpv6)
        )
        if (!IpRanges.length && !Ipv6Ranges.length) return permissions
        const permission = {
          IpProtocol: perm.IpProtocol,
          FromPort: perm.FromPort,
          ToPort: perm.ToPort
        }
        // IpRanges/Ipv6Ranges produce parameter errors when empty:
        if (IpRanges.length) permission.IpRanges = IpRanges
        if (Ipv6Ranges.length) permission.Ipv6Ranges = Ipv6Ranges
        return [...permissions, permission]
      }, [])
      if (!revokeIpPermissions.length) return null
      const params = {
        GroupId: ENV.groupid,
        IpPermissions: revokeIpPermissions
      }
      return EC2.revokeSecurityGroupIngress(params).promise()
    })
}

exports.handler = (event, context, callback) => {
  console.log('Event:', JSON.stringify(event))
  if (event.source === 'aws.events') {
    return cleanupIPs()
      .then(data => callback(null, data))
      .catch(callback)
  }
  const ip = event.requestContext.identity.sourceIp
  authorizeIP(ip)
    .then(data =>
      callback(null, {
        statusCode: 200,
        body: JSON.stringify(data)
      })
    )
    .catch(callback)
}
