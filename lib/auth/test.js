'use strict'

module.exports = {
  config:  {},
  assemble: assemble,
  strategyImpl: {
    authenticate: function() {
      throw new Error('strategyImpl.authenticate() must be stubbed')
    }
  }
}

function assemble(passport) {
  passport.use(new TestStrategy)
}

function TestStrategy() {
  this.name = 'test'
}

TestStrategy.prototype.authenticate = function(req, options) {
  module.exports.strategyImpl.authenticate(req, options, this)
}
