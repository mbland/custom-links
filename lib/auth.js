'use strict'

module.exports = exports = {
  assemble: assemble,
  findVerifiedId: findVerifiedId,
  verify: verify,
  makeUserSerializer: makeUserSerializer,
  makeUserDeserializer: makeUserDeserializer
}

function assemble(passport, linkDb, config) {
  config.AUTH_PROVIDERS.forEach(provider => {
    try {
      require('./auth/' + provider).assemble(passport, linkDb, config)
    } catch (err) {
      err.message = 'Failed to load ' + provider + ' provider: ' + err.message
      throw err
    }
  })
  passport.serializeUser(makeUserSerializer(linkDb))
  passport.deserializeUser(makeUserDeserializer(linkDb))
}

function findVerifiedId(userIds, config) {
  var users = config.users || [],
      domains = config.domains || []

  return userIds.map(userId => userId.toLowerCase())
    .find(userId => {
      return users.find(verifiedId => userId === verifiedId) ||
        domains.some(domain => userId.endsWith('@' + domain))
    })
}

function verify(linkDb, config, userIds, done) {
  var userId = findVerifiedId(userIds, config)

  if (userId === undefined) {
    return done(null, false)
  }
  sendUserOnSuccess(linkDb.findOrCreateUser(userId), done)
}

function sendUserOnSuccess(linkDbOp, done) {
  return linkDbOp
    .then(user => done(null, user))
    .catch(done)
}

function makeUserSerializer() {
  return (user, done) => done(null, user.id)
}

function makeUserDeserializer(linkDb) {
  return (userId, done) => sendUserOnSuccess(linkDb.findUser(userId), done)
}
