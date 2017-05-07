'use strict'

module.exports = {
  config:  {},
  assemble: assemble,
  strategy: new TestStrategy
}

function assemble(passport) {
  passport.use(module.exports.strategy)
}

function TestStrategy() {
  this.name = 'test'
}

TestStrategy.prototype.authenticate = function() {
  throw new Error('TestStrategy.authenticate() must be stubbed')
}
