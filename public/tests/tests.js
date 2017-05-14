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

  it('shows the landing page view when the hash ID is a hash only', function() {
    var view
    urlp.showView('#')
    view = urlpTest.getView('landing-view')
    view.length.should.equal(1)
  })

  it('passes the hash view parameter to the view function', function() {
    var landingViewSpy = sinon.spy(urlp, 'landingView')
    urlp.showView('#-foo-bar')
    landingViewSpy.calledWith('foo-bar').should.be.true
  })

  it('invokes the router when loaded', function() {
    var showViewSpy = sinon.spy(urlp, 'showView')
    urlp.loadApp()
    showViewSpy.calledWith(window.location.hash).should.be.true
  })

  describe('landingView', function() {
    it('shows a form to create a URL redirection', function() {
      var view = urlp.landingView(),
          form = view.getElementsByTagName('form').item(0),
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
