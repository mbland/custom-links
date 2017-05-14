/* eslint-env browser, mocha */
/* global expect, sinon */
'use strict'

describe('URL Pointers', function() {
  var urlp = window.urlp,
      urlpTest = window.urlpTest,
      spyOn,
      spies = []

  afterEach(function() {
    spies.forEach(function(spy) {
      spy.restore()
    })
  })

  spyOn = function(functionName) {
    spies.push(sinon.spy(urlp, functionName))
  }

  describe('showView', function() {
    it('shows the landing page view when no other view set', function() {
      urlp.showView('#foobar')
      urlpTest.getView('landing-view').length.should.equal(1)
    })

    it('shows the landing page view when the hash ID is empty', function() {
      urlp.showView('')
      urlpTest.getView('landing-view').length.should.equal(1)
    })

    it('shows the landing page view when the ID is a hash only', function() {
      urlp.showView('#')
      urlpTest.getView('landing-view').length.should.equal(1)
    })

    it('doesn\'t change the view when the hash ID is unknown', function() {
      urlp.showView('#')
      urlp.showView('#foobar')
      urlpTest.getView('landing-view').length.should.equal(1)
    })

    it('passes the hash view parameter to the view function', function() {
      spyOn('landingView')
      urlp.showView('#-foo-bar')
      urlp.landingView.calledWith('foo-bar').should.be.true
    })
  })

  describe('loadApp', function() {
    var invokeLoadApp

    invokeLoadApp = function() {
      var origHashChangeHandler = window.onhashchange,
          newHashChangeHandler

      urlp.loadApp()
      newHashChangeHandler = window.onhashchange
      window.onhashchange = origHashChangeHandler
      return newHashChangeHandler
    }

    it('invokes the router when loaded', function() {
      spyOn('showView')
      invokeLoadApp()
      urlp.showView.calledWith(window.location.hash).should.be.true
    })

    it('subscribes to the hashchange event', function() {
      var hashChangeHandler = invokeLoadApp()
      expect(typeof hashChangeHandler).to.equal('function')
      spyOn('showView')
      hashChangeHandler()
      urlp.showView.calledWith(window.location.hash).should.be.true
    })
  })

  describe('landingView', function() {
    it('shows a form to create a URL redirection', function() {
      var form = urlp.landingView().getElementsByTagName('form').item(0),
          labels = form.getElementsByTagName('label'),
          inputs = form.getElementsByTagName('input'),
          button = form.getElementsByTagName('button').item(0)
      expect(labels[0].textContent).to.eql('Custom link:')
      expect(inputs[0]).not.to.eql(null)
      expect(labels[1].textContent).to.eql('Redirect to:')
      expect(inputs[1]).not.to.eql(null)
      expect(button.textContent).to.contain('Create URL')
    })
  })
})
