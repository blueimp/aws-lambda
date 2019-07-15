/*
 * AWS Lambda function to grant the bucket owner full control over an S3 object.
 * https://github.com/blueimp/aws-lambda
 *
 * Required environment variables:
 * - rolearn: The ARN of the cross-account role to assume.
 *
 * Copyright 2017, Sebastian Tschan
 * https://blueimp.net
 *
 * Licensed under the MIT license:
 * https://opensource.org/licenses/MIT
 */

'use strict'

// eslint-disable-next-line node/no-unpublished-require
const AWS = require('aws-sdk')

AWS.config.credentials = new AWS.TemporaryCredentials({
  RoleArn: process.env.rolearn
})

exports.handler = (event, context, callback) => {
  // eslint-disable-next-line no-console
  console.log('Event:', JSON.stringify(event))
  const s3 = event.Records[0].s3
  new AWS.S3().putObjectAcl(
    {
      Bucket: s3.bucket.name,
      Key: s3.object.key,
      ACL: 'bucket-owner-full-control'
    },
    callback
  )
}
