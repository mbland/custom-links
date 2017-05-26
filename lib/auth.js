'use strict'

module.exports = exports = {
  assemble: assemble,
  findVerifiedId: findVerifiedId,
  verify: verify,
  makeUserSerializer: makeUserSerializer,
  makeUserDeserializer: makeUserDeserializer
}

function assemble(passport, redirectDb, config) {
  config.AUTH_PROVIDERS.forEach(provider => {
    try {
      require('./auth/' + provider).assemble(passport, redirectDb, config)
    } catch (err) {
      err.message = 'Failed to load ' + provider + ' provider: ' + err.message
      throw err
    }
  })
  passport.serializeUser(makeUserSerializer(redirectDb))
  passport.deserializeUser(makeUserDeserializer(redirectDb))
}

function findVerifiedId(userIds, config) {
  var users = config.users || [],
      domains = config.domains || []

  return userIds.find(userId => {
    return users.find(verifiedId => userId === verifiedId) ||
      domains.some(domain => userId.endsWith('@' + domain))
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
    .then(user => done(null, user))
    .catch(done)
}

function makeUserSerializer() {
  return (user, done) => done(null, user.id)
}

function makeUserDeserializer(redirectDb) {
  return (userId, done) => sendUserOnSuccess(redirectDb.findUser(userId), done)
}
