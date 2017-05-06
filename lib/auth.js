'use strict'

module.exports = exports = {
  findVerifiedEmail: findVerifiedEmail,
  verifyGoogle: verifyGoogle,
  serializeUser: serializeUser,
  deserializeUser: deserializeUser
}

function findVerifiedEmail(emails, config) {
  var users = config.users || [],
      domains = config.domains || []

  return emails.find(function(email) {
    return users.includes(email) || domains.some(function(domain) {
      return email.endsWith('@' + domain)
    })
  })
}

function sendUserOnSuccess(redirectDbOp, done) {
  return redirectDbOp
    .then(function(user) {
      done(null, user)
    })
    .catch(done)
}

function verifyGoogle(redirectDb, config) {
  return function(accessToken, refreshToken, profile, done) {
    var emails = profile.emails.map(function(email) {
          return email.value
        }),
        userId = findVerifiedEmail(emails, config)

    if (userId === undefined) {
      return done(null, false)
    }
    sendUserOnSuccess(redirectDb.findOrCreateUser(userId), done)
  }
}

function serializeUser() {
  return function(user, done) {
    done(null, user.id)
  }
}

function deserializeUser(redirectDb) {
  return function(userId, done) {
    sendUserOnSuccess(redirectDb.findUser(userId), done)
  }
}
