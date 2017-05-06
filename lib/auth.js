'use strict'

module.exports = exports = {
  findVerifiedId: findVerifiedId,
  verify: verify,
  verifyGoogle: verifyGoogle,
  serializeUser: serializeUser,
  deserializeUser: deserializeUser
}

function findVerifiedId(userIds, config) {
  var users = config.users || [],
      domains = config.domains || []

  return userIds.find(function(userId) {
    return users.find(function(verifiedId) {
      return userId === verifiedId
    }) || domains.some(function(domain) {
      return userId.endsWith('@' + domain)
    })
  })
}

function verify(redirectDb, config, userIds, done) {
  var userId = findVerifiedId(userIds, config)

  if (userId === undefined) {
    return done(null, false)
  }
  sendUserOnSuccess(redirectDb.findOrCreateUser(userId), done)
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
    var userIds = profile.emails.map(function(email) {
      return email.value
    })
    verify(redirectDb, config, userIds, done)
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
