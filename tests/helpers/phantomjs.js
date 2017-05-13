/* eslint-env node,browser */
// eslint-disable-next-line
// Inspired by https://blog.engineyard.com/2015/measuring-clientside-javascript-test-coverage-with-istanbul

'use strict'

var fs = require('fs')
var COVERAGE_OUTPUT = '.coverage/browser.json'

module.exports = {
  afterEnd: function(runner) {
    var coverage = runner.page.evaluate(function() {
      return window.__coverage__
    })

    if (coverage) {
      fs.write(COVERAGE_OUTPUT, JSON.stringify(coverage))
    }
  }
}
