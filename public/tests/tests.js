/* eslint-env browser, mocha */
'use strict'

describe('UrlPointers', function() {
  var urlpTest = window.urlpTest

  it('shows the default container', function() {
    urlpTest.getView('').length.should.equal(1)
  })
})
