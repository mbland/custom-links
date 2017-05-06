'use strict'

var auth = require('../auth')

module.exports = {
  config: {
    GOOGLE_CLIENT_ID: 'application ID for Google OAuth',
    GOOGLE_CLIENT_SECRET: 'application secret for Google OAuth',
    GOOGLE_REDIRECT_URL: 'URL to which Google OAuth will redirect the client'
  },

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
