'use strict'

var auth = require('../auth')

module.exports = {
  config: {
    OKTA_CLIENT_ID: 'clientID from Okta',
    OKTA_CLIENT_SECRET: 'application secret from Okta application config',
    OKTA_ISSUER: 'issuer name from Okta application configuration',
    OKTA_AUTHORIZATION_URL: 'authorization URL from Okta',
    OKTA_TOKEN_URL: 'token URL from Okta',
    OKTA_USER_INFO_URL: 'Okta URL from which user info is obtained',
    OKTA_CALLBACK_URL: 'callback URL to where Okta will send responses to'
  },
  assemble: assemble,
  verify: verify
}

function assemble(passport, linkDb, config) {
  var OktaStrategy = require('passport-openidconnect').Strategy,
      options = {
        issuer: config.OKTA_ISSUER,
        authorizationURL: config.OKTA_AUTHORIZATION_URL,
        tokenURL: config.OKTA_TOKEN_URL,
        userInfoURL: config.OKTA_USER_INFO_URL,
        clientID: config.OKTA_CLIENT_ID,
        clientSecret: config.OKTA_CLIENT_SECRET,
        callbackURL: config.OKTA_CALLBACK_URL,
      }
  passport.use(new OktaStrategy(options, verify(linkDb, config)))
  console.log("registered okta")
}

function verify(linkDb, config) {
  return (accessToken, refreshToken, profile, done) => {
    var userIds = new Array(profile._json.email)
    auth.verify(linkDb, config, userIds, done)
  }
}
