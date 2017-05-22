'use strict'

var auth = require('../auth')

module.exports = {
  config:  {},
  assemble: assemble
}

function assemble(passport, redirectDb, config) {
  passport.use(new TestStrategy(redirectDb, config))
}

function TestStrategy(redirectDb, config) {
  this.name = 'test'
  this.redirectDb = redirectDb
  this.config = config
}

TestStrategy.prototype.authenticate = function(req, options) {
  var userId = process.env.URL_POINTERS_TEST_AUTH,
      done = () => this.success({ id: userId }, options)

  if (userId === undefined) {
    throw new Error('URL_POINTERS_TEST_AUTH must be defined')
  } else if (req.path === '/auth') {
    this.redirect('/auth/callback')
  } else if (userId === 'fail') {
    this.fail()
  } else if (req.path === '/auth/callback') {
    // Return a Promise from this case for testing
    return new Promise((resolve, reject) => {
      auth.verify(this.redirectDb, this.config, [ userId ], (err, result) => {
        if (err || result === false) {
          this.fail()
          return reject(err || 'unknown user: ' + userId)
        }
        resolve(done())
      })
    })
  } else {
    done()
  }
}
