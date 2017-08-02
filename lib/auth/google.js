'use strict'

var auth = require('../auth')

module.exports = {
  config: {
    GOOGLE_CLIENT_ID: 'application ID for Google OAuth',
    GOOGLE_CLIENT_SECRET: 'application secret for Google OAuth',
    GOOGLE_CALLBACK_URL: 'URL to which Google OAuth will redirect the client'
  },

  assemble: assemble,
  verify: verify
}

function assemble(passport, linkDb, config) {
  var GoogleStrategy = require('passport-google-oauth20').Strategy,
      options = {
        clientID: config.GOOGLE_CLIENT_ID,
        clientSecret: config.GOOGLE_CLIENT_SECRET,
        callbackURL: config.GOOGLE_CALLBACK_URL
      }
  passport.use(new GoogleStrategy(options, verify(linkDb, config)))
}

function verify(linkDb, config) {
  return (accessToken, refreshToken, profile, done) => {
    var userIds = profile.emails.map(email => email.value)
    auth.verify(linkDb, config, userIds, done)
  }
}
