'use strict'

module.exports = {
  config:  {},
  assemble: assemble
}

function assemble(passport) {
  passport.use(new TestStrategy)
}

function TestStrategy() {
  this.name = 'test'
}

TestStrategy.prototype.authenticate = function(req, options) {
  var userId = process.env.URL_POINTERS_TEST_AUTH

  if (userId === undefined) {
    throw new Error('URL_POINTERS_TEST_AUTH must be defined')
  } else if (req.path === '/auth') {
    this.redirect('/auth/callback')
  } else if (userId === 'fail') {
    this.fail()
  } else {
    this.success({ id: userId }, options)
  }
}
