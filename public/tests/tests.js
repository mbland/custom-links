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

  describe('getTemplate', function() {
    it('returns a new template element', function() {
      var original = document.getElementsByClassName('landing-view')[0],
          template = urlp.getTemplate('landing-view')
      expect(original.textContent).to.have.string('URL Pointers')
      expect(template.textContent).to.have.string('URL Pointers')
      original.should.not.equal(template)
    })

    it('throws an error if passed an invalid template name', function() {
      expect(function() { urlp.getTemplate('foobar') })
        .to.throw(Error, 'unknown template name: foobar')
    })
  })

  describe('landingView', function() {
    it('shows a form to create a URL redirection', function() {
      var form = urlp.landingView().getElementsByTagName('form').item(0),
          labels = form.getElementsByTagName('label'),
          inputs = form.getElementsByTagName('input'),
          button = form.getElementsByTagName('button')[0]
      expect(labels[0].textContent).to.eql('Custom link:')
      expect(inputs[0]).not.to.eql(null)
      expect(labels[1].textContent).to.eql('Redirect to:')
      expect(inputs[1]).not.to.eql(null)
      expect(button.textContent).to.contain('Create URL')
    })
  })

  describe('applyData', function() {
    it('applies an object\'s properties to a template', function() {
      var data = {
            url: '/foo',
            location: 'https://mike-bland.com/',
            button: 'Create URL'
          },
          form = urlp.getTemplate('edit-link'),
          fields = form.getElementsByTagName('input'),
          url = fields[0],
          location = fields[1],
          button = form.getElementsByTagName('button')[0]

      expect(urlp.applyData(data, form)).to.equal(form)
      expect(url.defaultValue).to.equal('/foo')
      expect(location.defaultValue).to.equal('https://mike-bland.com/')
      expect(button.textContent).to.equal('Create URL')
    })
  })
})
