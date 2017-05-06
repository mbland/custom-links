'use strict'

var auth = require('../auth')

module.exports = {
  verify: verify
}

function verify(redirectDb, config) {
  return function(accessToken, refreshToken, profile, done) {
    var userIds = profile.emails.map(function(email) {
      return email.value
    })
    auth.verify(redirectDb, config, userIds, done)
  }
}
