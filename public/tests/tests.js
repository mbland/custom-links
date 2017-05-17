/* eslint-env browser, mocha */
/* global expect, sinon */
'use strict'

describe('URL Pointers', function() {
  var urlp = window.urlp,
      urlpTest = window.urlpTest,
      spyOn,
      stubOut,
      doubles = [],
      REDIRECT_LOCATION = 'https://mike-bland.com/'

  afterEach(function() {
    doubles.forEach(function(double) {
      double.restore()
    })
  })

  spyOn = function(functionName) {
    doubles.push(sinon.spy(urlp, functionName))
  }

  stubOut = function(functionName) {
    doubles.push(sinon.stub(urlp, functionName))
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
            location: REDIRECT_LOCATION,
            button: 'Create URL'
          },
          form = urlp.getTemplate('edit-link'),
          fields = form.getElementsByTagName('input'),
          url = fields[0],
          location = fields[1],
          button = form.getElementsByTagName('button')[0]

      expect(urlp.applyData(data, form)).to.equal(form)
      expect(url.defaultValue).to.equal('/foo')
      expect(location.defaultValue).to.equal(REDIRECT_LOCATION)
      expect(button.textContent).to.equal('Create URL')
    })
  })

  describe('fade', function() {
    var element

    beforeEach(function() {
      element = document.createElement('div')
      // Append directly to the body so the computed style isn't influenced by
      // urlpTest.fixture's "display: none" style.
      document.body.appendChild(element)
    })

    afterEach(function() {
      element.parentNode.removeChild(element)
    })

    it('fades out an element', function() {
      element.style.opacity = 1
      return urlp.fade(element, -0.1, 10).should.be.fulfilled
        .then(function(elem) {
          expect(elem).to.equal(element)
          expect(parseInt(elem.style.opacity)).to.equal(0)
        })
    })

    it('fades in an element', function() {
      element.style.opacity = 0
      return urlp.fade(element, 0.1, 10).should.be.fulfilled
        .then(function(elem) {
          expect(elem).to.equal(element)
          expect(parseInt(elem.style.opacity)).to.equal(1)
        })
    })

    it('handles increments < -1', function() {
      element.style.opacity = 1
      return urlp.fade(element, -1.1, 10).should.be.fulfilled
        .then(function(elem) {
          expect(parseInt(elem.style.opacity)).to.equal(0)
        })
    })

    it('handles increments > 1', function() {
      element.style.opacity = 0
      return urlp.fade(element, 1.1, 10).should.be.fulfilled
        .then(function(elem) {
          expect(parseInt(elem.style.opacity)).to.equal(1)
        })
    })

    it('throws an error for increments that aren\'t numbers', function() {
      expect(function() { urlp.fade(null, 'foobar') })
        .to.throw(Error, 'increment must be a nonzero number: foobar')
    })

    it('throws an error for increments === 0', function() {
      expect(function() { urlp.fade(null, 0.0) })
        .to.throw(Error, 'increment must be a nonzero number: 0')
    })

    it('throws an error for deadlines that aren\'t numbers', function() {
      expect(function() { urlp.fade(null, -0.05) })
        .to.throw(Error, 'deadline must be a positive number: undefined')
    })

    it('throws an error for deadlines <= 0', function() {
      expect(function() { urlp.fade(null, -0.05, 0) })
        .to.throw(Error, 'deadline must be a positive number: 0')
    })
  })

  describe('flashElement', function() {
    var element

    beforeEach(function() {
      element = document.createElement('div')
      // Append directly to the body so the computed style isn't influenced by
      // urlpTest.fixture's "display: none" style.
      document.body.appendChild(element)
      element.style.opacity = 1
    })

    afterEach(function() {
      element.parentNode.removeChild(element)
    })

    it('fades an element out, updates its text, and fades it back', function() {
      var replacement = '<p>Goodbye, World!</p>'

      stubOut('fade')
      urlp.fade.callsFake(function(element) {
        return Promise.resolve(element)
      })
      element.innerHTML = '<p>Hello, World!</p>'

      return urlp.flashElement(element, replacement).should.be.fulfilled
        .then(function(elem) {
          expect(elem).to.equal(element)
          expect(urlp.fade.calledTwice).to.be.true
          expect(parseInt(elem.style.opacity)).to.equal(1)
          expect(elem.innerHTML).to.equal(replacement)
        })
    })
  })

  describe('createLink', function() {
    var linkForm, expectXhr

    beforeEach(function() {
      linkForm = urlp.getTemplate('edit-link')
      linkForm.querySelector('[data-name=url]').value = 'foo'
      linkForm.querySelector('[data-name=location]').value = REDIRECT_LOCATION
    })

    expectXhr = function() {
      var payload = { location: REDIRECT_LOCATION }
      stubOut('xhr')
      return urlp.xhr.withArgs('POST', '/api/create/foo', payload)
    }

    it('creates a link that doesn\'t already exist', function() {
      expectXhr().returns(Promise.resolve())
      return urlp.createLink(linkForm).should.become(
        '/foo now redirects to ' + REDIRECT_LOCATION)
    })

    it('fails to create a link that already exists', function() {
      expectXhr().callsFake(function() {
        return Promise.reject({
          status: 403,
          response: { err: '/foo already exists' }
        })
      })

      return urlp.createLink(linkForm)
        .should.be.rejectedWith(/\/foo already exists/)
    })

    it('strips leading slashes from the link name', function() {
      var payload = { location: REDIRECT_LOCATION }
      stubOut('xhr')
      urlp.xhr.withArgs('POST', '/api/create/foo', payload)
        .returns(Promise.resolve())

      linkForm.querySelector('[data-name=url]').value = '///foo'
      return urlp.createLink(linkForm).should.become(
        '/foo now redirects to ' + REDIRECT_LOCATION)
    })

    it('throws an error if the custom link field is missing', function() {
      var urlField = linkForm.querySelector('[data-name=url]')
      urlField.parentNode.removeChild(urlField)
      expect(function() { urlp.createLink(linkForm) }).to.throw(Error,
        'fields missing from link form: ' + linkForm.outerHTML)
    })

    it('throws an error if the redirect location field is missing', function() {
      var locationField = linkForm.querySelector('[data-name=location]')
      locationField.parentNode.removeChild(locationField)
      expect(function() { urlp.createLink(linkForm) }).to.throw(Error,
        'fields missing from link form: ' + linkForm.outerHTML)
    })

    it('rejects if the custom link value is missing', function() {
      linkForm.querySelector('[data-name=url]').value = ''
      return urlp.createLink(linkForm).should.be.rejectedWith(
        'Custom link field must not be empty.')
    })

    it('rejects if the redirect location value is missing', function() {
      linkForm.querySelector('[data-name=location]').value = ''
      return urlp.createLink(linkForm).should.be.rejectedWith(
        'Redirect location field must not be empty.')
    })

    it('rejects if the location has an incorrect protocol', function() {
      linkForm.querySelector('[data-name=location]').value = 'gopher://bar'
      return urlp.createLink(linkForm).should.be.rejectedWith(
        'Redirect location protocol must be http:// or https://.')
    })

    it('rejects if the request returns a server error', function() {
      expectXhr().callsFake(function() {
        return Promise.reject({ status: 500 })
      })
      return urlp.createLink(linkForm)
        .should.be.rejectedWith(/server error .* \/foo wasn't created/)
    })

    it('rejects if the request raises a network error', function() {
      expectXhr().callsFake(function() {
        return Promise.reject(new Error('A network error occurred.'))
      })
      return urlp.createLink(linkForm)
        .should.be.rejectedWith('A network error occurred.')
    })

    it('rejects if the request raises another error', function() {
      expectXhr().callsFake(function() {
        return Promise.reject('forced error')
      })
      return urlp.createLink(linkForm)
        .should.be.rejectedWith('forced error')
    })
  })
})
