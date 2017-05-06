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

function verifyGoogle(redirectDb, config) {
  return function(accessToken, refreshToken, profile, cb) {
    var emails = profile.emails.map(function(email) {
          return email.value
        }),
        userId = findVerifiedEmail(emails, config)

    if (userId === undefined) {
      return cb(null, false)
    }
    redirectDb.findOrCreateUser(userId)
      .then(function(user) {
        cb(null, user)
      })
      .catch(cb)
  }
}

function serializeUser() {
  return function(user, done) {
    done(null, user.id)
  }
}

function deserializeUser(redirectDb) {
  return function(userId, done) {
    redirectDb.findUser(userId)
      .then(function(user) {
        done(null, user)
      })
      .catch(done)
  }
}
