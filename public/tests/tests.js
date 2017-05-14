/* eslint-env browser, mocha */
'use strict'

describe('UrlPointers', function() {
  var urlp = window.urlp,
      urlpTest = window.urlpTest

  it('shows the landing page view upon page load', function() {
    var view = urlpTest.getView('landing-view')
    view.length.should.equal(1)
  })

  it('shows the landing page view when the hash ID is empty', function() {
    var view
    urlp.showView('')
    view = urlpTest.getView('landing-view')
    view.length.should.equal(1)
  })
})
