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

  beforeEach(function() {
    stubOut('xhr')
  })

  afterEach(function() {
    doubles.forEach(function(double) {
      double.restore()
    })
  })

  spyOn = function(functionName) {
    var spy = sinon.spy(urlp, functionName)
    doubles.push(spy)
    return spy
  }

  stubOut = function(functionName) {
    var stub = sinon.stub(urlp, functionName)
    doubles.push(stub)
    return stub
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

    it('calls the done() callback if present', function() {
      var landingView = urlp.landingView,
          view

      stubOut('landingView').callsFake(function() {
        view = landingView()
        sinon.spy(view, 'done')
        return view
      })
      urlp.showView('#')
      expect(view.done.calledOnce).to.be.true
    })
  })

  describe('loadApp', function() {
    var invokeLoadApp

    beforeEach(function() {
      urlp.xhr.withArgs('GET', '/id').returns(
        Promise.resolve({ response: 'mbland@acm.org' }))
    })

    invokeLoadApp = function() {
      var origHashChangeHandler = window.onhashchange

      return urlp.loadApp().then(function() {
        var newHashChangeHandler = window.onhashchange
        window.onhashchange = origHashChangeHandler
        return newHashChangeHandler
      })
    }

    it('invokes the router when loaded', function() {
      spyOn('showView')
      return invokeLoadApp().then(function() {
        urlp.showView.calledWith(window.location.hash).should.be.true
      })
    })

    it('subscribes to the hashchange event', function() {
      return invokeLoadApp().then(function(hashChangeHandler) {
        expect(typeof hashChangeHandler).to.equal('function')
        spyOn('showView')
        hashChangeHandler()
        urlp.showView.calledWith(window.location.hash).should.be.true
      })
    })

    it('shows the nav bar', function() {
      return invokeLoadApp().then(function() {
        var navBar,
            userId,
            logout

        navBar = document.getElementsByClassName('nav')[0]
        expect(navBar).to.not.be.undefined

        userId = navBar.querySelector('[id=userid]')
        expect(userId).to.not.be.undefined
        userId.textContent.should.equal('mbland@acm.org')

        logout = navBar.getElementsByTagName('A')[0]
        expect(logout).to.not.be.undefined
        logout.href.should.equal(
          window.location.protocol + '//' + window.location.host + '/logout')
      })
    })

    it('shows an unknown user marker on /id error', function() {
      urlp.xhr.withArgs('GET', '/id').returns(
        Promise.reject({ status: 404, response: 'forced error' }))
      return invokeLoadApp().then(function() {
        document.getElementById('userid').textContent
          .should.equal('<unknown user>')
      })
    })
  })

  describe('getTemplate', function() {
    it('returns a new template element', function() {
      var original = document.getElementsByClassName('landing-view')[0],
          template = urlp.getTemplate('landing-view')
      expect(original).to.not.be.undefined
      expect(template).to.not.be.undefined
      original.should.not.equal(template)
    })

    it('throws an error if passed an invalid template name', function() {
      expect(function() { urlp.getTemplate('foobar') })
        .to.throw(Error, 'unknown template name: foobar')
    })
  })

  describe('landingView', function() {
    it('shows a form to create a URL redirection', function() {
      var view = urlp.landingView(),
          form = view.element.getElementsByTagName('form').item(0),
          labels = form.getElementsByTagName('label'),
          inputs = form.getElementsByTagName('input'),
          button = form.getElementsByTagName('button')[0],
          inputFocus

      expect(labels[0].textContent).to.eql('Custom link:')
      expect(inputs[0]).not.to.eql(null)
      expect(labels[1].textContent).to.eql('Redirect to:')
      expect(inputs[1]).not.to.eql(null)
      expect(button.textContent).to.contain('Create URL')

      inputFocus = sinon.stub(inputs[0], 'focus')
      view.done()
      expect(inputFocus.calledOnce).to.be.true
    })
  })

  describe('applyData', function() {
    it('applies an object\'s properties to a template', function() {
      var data = {
            url: '/foo',
            location: REDIRECT_LOCATION,
            submit: 'Create URL'
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
    var element, setTimeoutStub

    beforeEach(function() {
      element = document.createElement('div')
      // Append directly to the body so the computed style isn't influenced by
      // urlpTest.fixture's "display: none" style.
      document.body.appendChild(element)
      setTimeoutStub = sinon.stub(window, 'setTimeout')
      setTimeoutStub.callsFake(function(func) {
        func()
      })
    })

    afterEach(function() {
      setTimeoutStub.restore()
      element.parentNode.removeChild(element)
    })

    it('fades out an element', function() {
      element.style.opacity = 1
      return urlp.fade(element, -0.1, 10).should.be.fulfilled
        .then(function(elem) {
          expect(elem).to.equal(element)
          expect(parseInt(elem.style.opacity)).to.equal(0)
          expect(setTimeoutStub.callCount).to.equal(10)
        })
    })

    it('fades in an element', function() {
      element.style.opacity = 0
      return urlp.fade(element, 0.1, 10).should.be.fulfilled
        .then(function(elem) {
          expect(elem).to.equal(element)
          expect(parseInt(elem.style.opacity)).to.equal(1)
          expect(setTimeoutStub.callCount).to.equal(10)
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
    var linkForm, expectXhr,
        resultUrl = window.location.origin + '/foo',
        resultAnchor = '<a href=\'/foo\'>' + resultUrl + '</a>'

    beforeEach(function() {
      linkForm = urlp.getTemplate('edit-link')
      linkForm.querySelector('[data-name=url]').value = 'foo'
      linkForm.querySelector('[data-name=location]').value = REDIRECT_LOCATION
    })

    expectXhr = function() {
      var payload = { location: REDIRECT_LOCATION }
      return urlp.xhr.withArgs('POST', '/api/create/foo', payload)
    }

    it('creates a link that doesn\'t already exist', function() {
      expectXhr().returns(Promise.resolve())
      return urlp.createLink(linkForm).should.become(
        resultAnchor + ' now redirects to ' + REDIRECT_LOCATION)
    })

    it('fails to create a link that already exists', function() {
      expectXhr().callsFake(function() {
        return Promise.reject({
          status: 403,
          response: { err: '/foo already exists' }
        })
      })

      return urlp.createLink(linkForm)
        .should.be.rejectedWith(new RegExp(resultAnchor + ' already exists'))
    })

    it('strips leading slashes from the link name', function() {
      var payload = { location: REDIRECT_LOCATION }
      urlp.xhr.withArgs('POST', '/api/create/foo', payload)
        .returns(Promise.resolve())

      linkForm.querySelector('[data-name=url]').value = '///foo'
      return urlp.createLink(linkForm).should.become(
        resultAnchor + ' now redirects to ' + REDIRECT_LOCATION)
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
      return urlp.createLink(linkForm).should.be.rejectedWith(
        new RegExp('server error .* ' + resultUrl.replace('/', '\\/') +
          ' wasn\'t created'))
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
      return urlp.createLink(linkForm).should.be.rejectedWith('forced error')
    })

    it('rejects when the server response doesn\'t contain JSON', function() {
      // This models what happens when trying to POST to the local test server
      // instead of the actual application backend.
      expectXhr().callsFake(function() {
        return Promise.reject({
          status: 405,
          statusText: 'Method not allowed'
        })
      })
      return urlp.createLink(linkForm)
        .should.be.rejectedWith('Could not create ' + resultUrl +
          ': Method not allowed')
    })
  })

  describe('createLinkClick', function() {
    var view, button, result

    beforeEach(function() {
      urlp.showView('#')
      view = urlpTest.getView('landing-view')[0]
      button = view.getElementsByTagName('button')[0]
      result = view.getElementsByClassName('result')[0]

      // Attach the view to the body to make it visible; needed to test
      // focus/document.activeElement.
      document.body.appendChild(view)

      // Stub urlp.fade() instead of urlp.flashElement() because we depend upon
      // the result's innerHTML to be set by the latter.
      stubOut('fade').callsFake(function(element, increment) {
        element.style.opacity = increment < 0.0 ? 0 : 1
        return Promise.resolve(element)
      })
    })

    afterEach(function() {
      view.parentNode.removeChild(view)
    })

    it('flashes on success', function() {
      stubOut('createLink')
        .returns(Promise.resolve('<a href="/foo">success</a>'))
      button.click()
      return result.done.should.be.fulfilled.then(function() {
        var successDiv = result.getElementsByClassName('success')[0],
            anchor
        expect(successDiv).to.not.be.undefined
        successDiv.textContent.should.equal('success')
        anchor = successDiv.getElementsByTagName('A')[0]
        expect(anchor).to.not.be.undefined
        anchor.should.equal(document.activeElement)
      })
    })

    it('flashes on failure', function() {
      stubOut('createLink').callsFake(function() {
        return Promise.reject('forced failure')
      })
      button.click()
      return result.done.should.be.fulfilled.then(function() {
        var failureDiv = result.getElementsByClassName('failure')[0]
        expect(failureDiv).to.not.be.undefined
        failureDiv.textContent.should.equal('forced failure')
      })
    })

    it('flashes on error', function() {
      stubOut('createLink').callsFake(function() {
        return Promise.reject(new Error('forced error'))
      })
      button.click()
      return result.done.should.be.fulfilled.then(function() {
        var failureDiv = result.getElementsByClassName('failure')[0]
        expect(failureDiv).to.not.be.undefined
        failureDiv.textContent.should.equal('forced error')
      })
    })
  })
})
