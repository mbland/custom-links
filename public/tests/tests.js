/* eslint-env browser, mocha */
/* global expect, sinon */
'use strict'

describe('Custom Links', function() {
  var cl = window.cl,
      clTest = window.clTest,
      spyOn,
      stubOut,
      doubles = [],
      viewElementReceivesFocus,
      prepareFlashingElement,
      HOST_PREFIX = window.location.protocol + '//' + window.location.host,
      LINK_TARGET = 'https://mike-bland.com/'

  afterEach(function() {
    doubles.forEach(function(double) {
      double.restore()
    })
  })

  spyOn = function(obj, functionName) {
    var spy = sinon.spy(obj, functionName)
    doubles.push(spy)
    return spy
  }

  stubOut = function(obj, functionName) {
    var stub = sinon.stub(obj, functionName)
    doubles.push(stub)
    return stub
  }

  viewElementReceivesFocus = function(view, element) {
    var inputFocus = sinon.stub(element, 'focus')
    view.done()
    return inputFocus.calledOnce
  }

  prepareFlashingElement = function(element) {
    // Attach the element to the body to make it visible; needed to test
    // focus/document.activeElement.
    document.body.appendChild(element)

    // Stub cl.fade() instead of cl.flashElement() because we depend upon
    // the result's innerHTML to be set by the latter.
    stubOut(cl, 'fade').callsFake(function(element, increment) {
      element.style.opacity = increment < 0.0 ? 0 : 1
      return Promise.resolve(element)
    })
    return element
  }

  describe('showView', function() {
    it('does not show the landing view until called', function() {
      clTest.getView('landing-view').length.should.equal(0)
    })

    it('shows the landing page view when no other view set', function() {
      return cl.showView('#foobar').then(function() {
        clTest.getView('landing-view').length.should.equal(1)
      })
    })

    it('shows the landing page view when the hash ID is empty', function() {
      return cl.showView('').then(function() {
        clTest.getView('landing-view').length.should.equal(1)
      })
    })

    it('shows the landing page view when the ID is a hash only', function() {
      // This normally won't happen, since window.location.hash will return the
      // empty string if only '#' is present.
      return cl.showView('#').then(function() {
        clTest.getView('landing-view').length.should.equal(1)
      })
    })

    it('doesn\'t change the view when the hash ID is unknown', function() {
      return cl.showView('#')
        .then(function() {
          return cl.showView('#foobar')
        })
        .then(function() {
          clTest.getView('landing-view').length.should.equal(1)
        })
    })

    it('passes the hash view parameter to the view function', function() {
      spyOn(cl, 'landingView')
      return cl.showView('#-/foo').then(function() {
        cl.landingView.calledWith('/foo').should.be.true
      })
    })

    it('calls the done() callback if present', function() {
      var landingView = cl.landingView,
          doneSpy

      stubOut(cl, 'landingView').callsFake(function() {
        return landingView().then(function(view) {
          doneSpy = sinon.spy(view, 'done')
          return view
        })
      })
      return cl.showView('#').then(function() {
        expect(doneSpy.calledOnce).to.be.true
      })
    })

    it('shows the landing view when the container isn\'t empty', function() {
      var container = document.getElementsByClassName('view-container')[0]
      container.children.length.should.equal(0)
      container.appendChild(document.createElement('p'))
      container.children.length.should.equal(1)

      return cl.showView('').then(function() {
        container.children.length.should.equal(1)
        clTest.getView('landing-view').length.should.equal(1)
      })
    })
  })

  describe('Backend', function() {
    var backend, xhr

    beforeEach(function() {
      xhr = sinon.stub()
      backend = new cl.Backend(xhr)
    })

    describe('getLoggedInUserId', function() {
      it('returns the user ID from a successful response', function() {
        xhr.withArgs('GET', '/id').returns(
          Promise.resolve({ response: 'mbland@acm.org' }))
        return backend.getLoggedInUserId().should.become('mbland@acm.org')
      })

      it('returns cl.UNKNOWN_USER if the request fails', function() {
        xhr.withArgs('GET', '/id').returns(Promise.reject())
        return backend.getLoggedInUserId().should.become(cl.UNKNOWN_USER)
      })
    })

    describe('getUserInfo', function() {
      beforeEach(function() {
        stubOut(console, 'error')
      })

      it('returns user info from a successful response', function() {
        var usersLinks = [
            { link: '/foo', target: 'https://foo.com/', count: 1 },
            { link: '/bar', target: 'https://bar.com/', count: 2 },
            { link: '/baz', target: 'https://baz.com/', count: 3 }
        ]

        xhr.withArgs('GET', '/api/user/mbland@acm.org').returns(
          Promise.resolve({ response: JSON.stringify({ links: usersLinks }) }))
        return backend.getUserInfo('mbland@acm.org')
          .should.become({ links: usersLinks })
      })

      it('returns an empty response for cl.UNKNOWN_USER', function() {
        return backend.getUserInfo(cl.UNKNOWN_USER).should.become({})
      })

      it('rejects with an error message', function() {
        xhr.withArgs('GET', '/api/user/mbland@acm.org').returns(
          Promise.reject(new Error('simulated error')))
        return backend.getUserInfo('mbland@acm.org').should.be.rejectedWith(
          'Request for user info failed: simulated error')
      })

      it('rejects with status text', function() {
        xhr.withArgs('GET', '/api/user/mbland@acm.org').returns(
          Promise.reject({ statusText: 'Forbidden' }))
        return backend.getUserInfo('mbland@acm.org').should.be.rejectedWith(
          'Request for user info failed: Forbidden')
      })

      it('rejects with a parse error from invalid response text', function() {
        xhr.withArgs('GET', '/api/user/mbland@acm.org').returns(
          Promise.resolve({ response: 'foobar' }))
        return backend.getUserInfo('mbland@acm.org')
          .should.be.rejectedWith('Failed to parse user info response: ')
          .then(function() {
            console.error.args[0].should.eql(
              ['Bad user info response:', 'foobar'])
          })
      })
    })

    describe('createLink', function() {
      it('returns a success message after a link is created', function() {
        xhr
          .withArgs('POST', '/api/create/foo', { target: 'https://foo.com/' })
          .returns(Promise.resolve())
        return backend.createLink('foo', 'https://foo.com/')
          .should.become('<a href=\'/foo\'>' +
            window.location.protocol + '//' + window.location.host +
            '/foo</a> now redirects to https://foo.com/')
      })

      it('rejects with an error message if a link isn\'t created', function() {
        xhr
          .withArgs('POST', '/api/create/foo', { target: 'https://foo.com/' })
          .returns(Promise.reject('simulated error'))
        return backend.createLink('foo', 'https://foo.com/')
          .should.be.rejectedWith('The link wasn\'t created: simulated error')
      })
    })

    describe('deleteLink', function() {
      it('returns a success message after a link is deleted', function() {
        xhr.withArgs('DELETE', '/api/delete/foo').returns(Promise.resolve())
        return backend.deleteLink('/foo').should.become('/foo has been deleted')
      })

      it('rejects with an error message if a link isn\'t deleted', function() {
        xhr.withArgs('DELETE', '/api/delete/foo')
          .returns(Promise.reject('simulated error'))
        return backend.deleteLink('/foo')
          .should.be.rejectedWith('/foo wasn\'t deleted: simulated error')
      })
    })
  })

  describe('loadApp', function() {
    var invokeLoadApp

    beforeEach(function() {
      stubOut(cl.backend, 'getLoggedInUserId')
      cl.backend.getLoggedInUserId.returns(Promise.resolve('mbland@acm.org'))
    })

    invokeLoadApp = function() {
      var origHashChangeHandler = window.onhashchange

      return cl.loadApp().then(function() {
        var newHashChangeHandler = window.onhashchange
        window.onhashchange = origHashChangeHandler
        return newHashChangeHandler
      })
    }

    it('invokes the router when loaded', function() {
      spyOn(cl, 'showView')
      return invokeLoadApp().then(function() {
        cl.showView.calledWith(window.location.hash).should.be.true
      })
    })

    it('subscribes to the hashchange event', function() {
      return invokeLoadApp().then(function(hashChangeHandler) {
        expect(typeof hashChangeHandler).to.equal('function')
        spyOn(cl, 'showView')
        hashChangeHandler()
        cl.showView.calledWith(window.location.hash).should.be.true
      })
    })

    it('sets the logged in user ID', function() {
      return invokeLoadApp().then(function() {
        cl.userId.should.equal('mbland@acm.org')
      })
    })

    it('shows the nav bar', function() {
      return invokeLoadApp().then(function() {
        var navBar,
            userId,
            navLinks

        navBar = document.getElementsByClassName('nav')[0]
        expect(navBar).to.not.be.undefined

        userId = navBar.querySelector('[id=userid]')
        expect(userId).to.not.be.undefined
        userId.textContent.should.equal('mbland@acm.org')

        navLinks = navBar.getElementsByTagName('A')
        navLinks.length.should.equal(3)
        navLinks[0].href.should.equal(HOST_PREFIX + '/#')
        navLinks[1].href.should.equal(HOST_PREFIX + '/#links')
        navLinks[2].href.should.equal(HOST_PREFIX + '/logout')
      })
    })
  })

  describe('getTemplate', function() {
    it('returns a new template element', function() {
      var original = document.getElementsByClassName('landing-view')[0],
          template = cl.getTemplate('landing-view')
      expect(original).to.not.be.undefined
      expect(template).to.not.be.undefined
      original.should.not.equal(template)
    })

    it('throws an error if passed an invalid template name', function() {
      expect(function() { cl.getTemplate('foobar') })
        .to.throw(Error, 'unknown template name: foobar')
    })
  })

  describe('landingView', function() {
    it('shows a form to create a custom link', function() {
      return cl.landingView().then(function(view) {
        var form = view.element.getElementsByTagName('form').item(0),
            labels = form.getElementsByTagName('label'),
            inputs = form.getElementsByTagName('input'),
            button = form.getElementsByTagName('button')[0]

        expect(labels[0].textContent).to.eql('Custom link:')
        expect(inputs[0]).not.to.eql(null)
        expect(labels[1].textContent).to.eql('Target URL:')
        expect(inputs[1]).not.to.eql(null)
        expect(button.textContent).to.contain('Create link')
        expect(viewElementReceivesFocus(view, inputs[0])).to.equal(true)
      })
    })

    it('fills in the link field when passed a hash view parameter', function() {
      return cl.landingView('/foo').then(function(view) {
        var form = view.element.getElementsByTagName('form').item(0),
            inputs = form.getElementsByTagName('input')

        expect(inputs[0]).not.to.eql(null)
        inputs[0].defaultValue.should.equal('foo')
        expect(viewElementReceivesFocus(view, inputs[1])).to.equal(true)
      })
    })
  })

  describe('applyData', function() {
    it('applies an object\'s properties to a template', function() {
      var data = {
            link: '/foo',
            target: LINK_TARGET
          },
          form = cl.getTemplate('edit-link'),
          fields = form.getElementsByTagName('input'),
          link = fields[0],
          target = fields[1]

      expect(cl.applyData(data, form)).to.equal(form)
      expect(link.defaultValue).to.equal('/foo')
      expect(target.defaultValue).to.equal(LINK_TARGET)
    })
  })

  describe('fade', function() {
    var element, setTimeoutStub

    beforeEach(function() {
      element = clTest.createVisibleElement('div')
      setTimeoutStub = sinon.stub(window, 'setTimeout')
      setTimeoutStub.callsFake(function(func) {
        func()
      })
    })

    afterEach(function() {
      setTimeoutStub.restore()
      clTest.removeElement(element)
    })

    it('fades out an element', function() {
      element.style.opacity = 1
      return cl.fade(element, -0.1, 10).should.be.fulfilled
        .then(function(elem) {
          expect(elem).to.equal(element)
          expect(parseInt(elem.style.opacity)).to.equal(0)
          expect(setTimeoutStub.callCount).to.equal(10)
        })
    })

    it('fades in an element', function() {
      element.style.opacity = 0
      return cl.fade(element, 0.1, 10).should.be.fulfilled
        .then(function(elem) {
          expect(elem).to.equal(element)
          expect(parseInt(elem.style.opacity)).to.equal(1)
          expect(setTimeoutStub.callCount).to.equal(10)
        })
    })

    it('handles increments < -1', function() {
      element.style.opacity = 1
      return cl.fade(element, -1.1, 10).should.be.fulfilled
        .then(function(elem) {
          expect(parseInt(elem.style.opacity)).to.equal(0)
        })
    })

    it('handles increments > 1', function() {
      element.style.opacity = 0
      return cl.fade(element, 1.1, 10).should.be.fulfilled
        .then(function(elem) {
          expect(parseInt(elem.style.opacity)).to.equal(1)
        })
    })

    it('throws an error for increments that aren\'t numbers', function() {
      expect(function() { cl.fade(null, 'foobar') })
        .to.throw(Error, 'increment must be a nonzero number: foobar')
    })

    it('throws an error for increments === 0', function() {
      expect(function() { cl.fade(null, 0.0) })
        .to.throw(Error, 'increment must be a nonzero number: 0')
    })

    it('throws an error for deadlines that aren\'t numbers', function() {
      expect(function() { cl.fade(null, -0.05) })
        .to.throw(Error, 'deadline must be a positive number: undefined')
    })

    it('throws an error for deadlines <= 0', function() {
      expect(function() { cl.fade(null, -0.05, 0) })
        .to.throw(Error, 'deadline must be a positive number: 0')
    })
  })

  describe('flashElement', function() {
    var element

    beforeEach(function() {
      element = clTest.createVisibleElement('div')
      element.style.opacity = 1
    })

    afterEach(function() {
      clTest.removeElement(element)
    })

    it('fades an element out, updates its text, and fades it back', function() {
      var replacement = '<p>Goodbye, World!</p>'

      stubOut(cl, 'fade')
      cl.fade.callsFake(function(element) {
        return Promise.resolve(element)
      })
      element.innerHTML = '<p>Hello, World!</p>'

      return cl.flashElement(element, replacement).should.be.fulfilled
        .then(function(elem) {
          expect(elem).to.equal(element)
          expect(cl.fade.calledTwice).to.be.true
          expect(parseInt(elem.style.opacity)).to.equal(1)
          expect(elem.innerHTML).to.equal(replacement)
        })
    })
  })

  describe('createLinkInfo', function() {
    it('returns an object with the relative URL, full URL, anchor', function() {
      var full = window.location.origin + '/foo',
          result = cl.createLinkInfo('foo')
      result.relative.should.equal('/foo')
      result.full.should.equal(full)
      result.anchor.should.equal('<a href=\'/foo\'>' + full + '</a>')
    })

    it('handles a link that already has a leading slash', function() {
      var full = window.location.origin + '/foo',
          result = cl.createLinkInfo('/foo')
      result.relative.should.equal('/foo')
      result.full.should.equal(full)
      result.anchor.should.equal('<a href=\'/foo\'>' + full + '</a>')
    })
  })

  describe('apiErrorMessage', function() {
    var xhr, linkInfo, prefix

    beforeEach(function() {
      xhr = {
        status: 403,
        statusText: 'Permission denied'
      }
      linkInfo = cl.createLinkInfo('foo')
      prefix = 'The operation failed'
    })

    it('uses the Error message', function() {
      delete xhr.status
      expect(cl.apiErrorMessage(new Error('Error!'), linkInfo, prefix))
        .to.equal('The operation failed: Error!')
    })

    it('returns the error string as-is', function() {
      delete xhr.status
      expect(cl.apiErrorMessage('plain string', linkInfo, prefix))
        .to.equal('The operation failed: plain string')
    })

    it('returns a server error message', function() {
      xhr.status = 500
      expect(cl.apiErrorMessage(xhr, linkInfo, prefix))
        .to.match(/The operation failed: A server error occurred\./)
    })

    it('returns response text with the link replaced by an anchor', function() {
      xhr.response = JSON.stringify({ err: 'Could not do stuff with /foo.' })
      expect(cl.apiErrorMessage(xhr, linkInfo, prefix))
        .to.equal('The operation failed: ' +
          'Could not do stuff with ' + linkInfo.anchor + '.')
    })

    it('returns the failure message and the statusText', function() {
      expect(cl.apiErrorMessage(xhr, linkInfo, prefix))
        .to.equal('The operation failed: Permission denied')
    })
  })

  describe('rejectOnApiError', function() {
    it('creates a rejected Promise handler for a failed API call', function() {
      return cl.rejectOnApiError('foo', 'API call failed')(new Error('Error!'))
        .should.be.rejectedWith('API call failed: Error!')
    })
  })

  describe('confirmDelete', function() {
    var dialog, resultElement, linksView

    beforeEach(function() {
      stubOut(cl.backend, 'deleteLink')
      resultElement = prepareFlashingElement(document.createElement('div'))
      linksView = new cl.View(cl.getTemplate('links-view'), function() { })
      linksView.numLinks = 1
      linksView.updateNumLinks = sinon.spy()
      dialog = cl.confirmDelete('/foo', resultElement, linksView)
      dialog.open()
    })

    afterEach(function() {
      dialog.close()
      clTest.removeElement(resultElement)
    })

    it('opens a dialog box to delete the specified link', function() {
      dialog.element.parentNode.should.equal(document.body)
      cl.backend.deleteLink.withArgs('/foo').returns(Promise.resolve('deleted'))
      dialog.confirm.click()
      return dialog.operation.then(function() {
        cl.backend.deleteLink.called.should.be.true
        resultElement.textContent.should.equal('deleted')
        linksView.updateNumLinks.withArgs(-1).calledOnce.should.be.true
      })
    })
  })

  describe('createAnchor', function() {
    it('creates a new anchor using the URL as the anchor text', function() {
      var anchor = cl.createAnchor('https://example.com')
      anchor.href.should.equal('https://example.com/')
      anchor.textContent.should.equal('https://example.com')
    })

    it('creates a new anchor using the supplied anchor text', function() {
      var anchor = cl.createAnchor('https://example.com', 'test link')
      anchor.href.should.equal('https://example.com/')
      anchor.textContent.should.equal('test link')
    })
  })

  describe('focusFirstElement', function() {
    var element,
        firstAnchor,
        secondAnchor

    beforeEach(function() {
      element = clTest.createVisibleElement('div')
      firstAnchor = cl.createAnchor('https://example.com/', 'first')
      element.appendChild(firstAnchor)
      secondAnchor = cl.createAnchor('https://example.com/', 'second')
      element.appendChild(secondAnchor)
    })

    afterEach(function() {
      clTest.removeElement(element)
    })

    it('does nothing if no matching tag exists', function() {
      cl.focusFirstElement(element, 'input')
      document.activeElement.should.not.equal(firstAnchor)
      document.activeElement.should.not.equal(secondAnchor)
    })

    it('matches first anchor', function() {
      cl.focusFirstElement(element, 'a')
      document.activeElement.should.equal(firstAnchor)
      document.activeElement.should.not.equal(secondAnchor)
    })
  })

  describe('createLink', function() {
    var linkForm, expectBackendCall

    beforeEach(function() {
      stubOut(cl.backend, 'createLink')
      linkForm = cl.getTemplate('edit-link')
      linkForm.querySelector('[data-name=link]').value = 'foo'
      linkForm.querySelector('[data-name=target]').value = LINK_TARGET
    })

    expectBackendCall = function() {
      return cl.backend.createLink.withArgs('foo', LINK_TARGET)
    }

    it('creates a link from valid form data', function() {
      expectBackendCall().returns(Promise.resolve('backend call succeeded'))
      return cl.createLink(linkForm).should.become('backend call succeeded')
    })

    it('fails to create a link from valid form data', function() {
      expectBackendCall().returns(Promise.reject('backend call failed'))
      return cl.createLink(linkForm)
        .should.be.rejectedWith('backend call failed')
    })

    it('strips leading slashes from the link name', function() {
      expectBackendCall().returns(Promise.resolve('backend call succeeded'))
      linkForm.querySelector('[data-name=link]').value = '///foo'
      return cl.createLink(linkForm).should.become('backend call succeeded')
    })

    it('throws an error if the custom link field is missing', function() {
      var linkField = linkForm.querySelector('[data-name=link]')
      linkField.parentNode.removeChild(linkField)
      expect(function() { cl.createLink(linkForm) }).to.throw(Error,
        'fields missing from link form: ' + linkForm.outerHTML)
    })

    it('throws an error if the target URL field is missing', function() {
      var targetField = linkForm.querySelector('[data-name=target]')
      targetField.parentNode.removeChild(targetField)
      expect(function() { cl.createLink(linkForm) }).to.throw(Error,
        'fields missing from link form: ' + linkForm.outerHTML)
    })

    it('rejects if the custom link value is missing', function() {
      linkForm.querySelector('[data-name=link]').value = ''
      return cl.createLink(linkForm).should.be.rejectedWith(
        'Custom link field must not be empty.')
    })

    it('rejects if the target URL value is missing', function() {
      linkForm.querySelector('[data-name=target]').value = ''
      return cl.createLink(linkForm).should.be.rejectedWith(
        'Target URL field must not be empty.')
    })

    it('rejects if the target URL has an incorrect protocol', function() {
      linkForm.querySelector('[data-name=target]').value = 'gopher://bar'
      return cl.createLink(linkForm).should.be.rejectedWith(
        'Target URL protocol must be http:// or https://.')
    })
  })

  describe('flashResult', function() {
    var element

    beforeEach(function() {
      element = prepareFlashingElement(document.createElement('div'))
    })

    afterEach(function() {
      clTest.removeElement(element)
    })

    it('flashes a success message', function() {
      return cl.flashResult(element, Promise.resolve('Success!'))
        .then(function() {
          element.textContent.should.equal('Success!')
          expect(element.children[0]).to.not.be.undefined
          element.children[0].className.should.equal('result success')
        })
    })

    it('flashes a failure message', function() {
      return cl.flashResult(element, Promise.reject('Failure!'))
        .then(function() {
          element.textContent.should.equal('Failure!')
          expect(element.children[0]).to.not.be.undefined
          element.children[0].className.should.equal('result failure')
        })
    })

    it('flashes a failure message on Error', function() {
      return cl.flashResult(element, Promise.reject(new Error('Error!')))
        .then(function() {
          element.textContent.should.equal('Error!')
          expect(element.children[0]).to.not.be.undefined
          element.children[0].className.should.equal('result failure')
        })
    })

    it('focuses the first anchor if present', function() {
      var anchor = '<a href="#">Click me!</a>'
      return cl.flashResult(element, Promise.resolve(anchor))
        .then(function() {
          element.textContent.should.equal('Click me!')
          expect(element.children[0]).to.not.be.undefined
          element.children[0].className.should.equal('result success')
          expect(element.children[0].getElementsByTagName('a')[0])
            .to.equal(document.activeElement)
        })
    })
  })

  describe('createLinkClick', function() {
    var view, button, result

    beforeEach(function() {
      return cl.showView('#').then(function() {
        view = prepareFlashingElement(clTest.getView('landing-view')[0])
        button = view.getElementsByTagName('button')[0]
        result = view.getElementsByClassName('result')[0]
      })
    })

    afterEach(function() {
      view.parentNode.removeChild(view)
    })

    it('flashes result after API call', function() {
      stubOut(cl, 'createLink')
        .returns(Promise.resolve('<a href="/foo">success</a>'))
      button.click()
      return result.done.should.be.fulfilled.then(function() {
        var successDiv = result.getElementsByClassName('success')[0]
        expect(successDiv).to.not.be.undefined
        successDiv.textContent.should.equal('success')
        expect(successDiv.getElementsByTagName('A')[0])
          .to.equal(document.activeElement)
      })
    })
  })

  describe('createLinksTable', function() {
    var linksView

    beforeEach(function() {
      linksView = new cl.View(cl.getTemplate('links-view'), function() { })
    })

    it('returns an empty table if no links', function() {
      var table = cl.createLinksTable([]),
          header = table.children[0]

      table.children.length.should.equal(1)
      header.className.split(' ').indexOf('links-header').should.not.equal(-1)
    })

    it('returns a table with a single element', function() {
      var links = [{ link: '/foo', target: 'https://foo.com/', count: 3 }],
          table = cl.createLinksTable(links, linksView),
          linkRow = table.children[1],
          anchors,
          buttons,
          linkTarget,
          clicksAction

      table.children.length.should.equal(2)
      linkTarget = linkRow.children[0]
      anchors = linkTarget.getElementsByTagName('a')
      anchors.length.should.equal(2)
      anchors[0].textContent.should.equal('/foo')
      anchors[0].href.should.equal(HOST_PREFIX + '/foo')
      anchors[1].textContent.should.equal('https://foo.com/')
      anchors[1].href.should.equal('https://foo.com/')

      clicksAction = linkRow.children[1]
      clicksAction.children.length.should.equal(2)
      clicksAction.children[0].textContent.should.equal('3')
      buttons = clicksAction.children[1].getElementsByTagName('button')
      buttons.length.should.equal(2)

      // Note that as yet, the Edit button has yet to be implemented.
      buttons[0].textContent.should.equal('Edit')
      buttons[1].textContent.should.equal('Delete')
    })

    it('launches a dialog box to confirm deletion', function() {
      var links = [{ link: '/foo', target: 'https://foo.com/', count: 3 }],
          table = cl.createLinksTable(links, linksView),
          row = table.getElementsByClassName('link')[0],
          deleteButton = row.getElementsByTagName('button')[1],
          openSpy = sinon.spy()

      stubOut(cl, 'confirmDelete')
      cl.confirmDelete.withArgs('/foo').returns({ open: openSpy })
      deleteButton.click()
      cl.confirmDelete.called.should.be.true
      cl.confirmDelete.args[0][0].should.equal('/foo')
      cl.confirmDelete.args[0][1].should.not.be.null
      cl.confirmDelete.args[0][2].should.equal(linksView)
      openSpy.called.should.be.true
    })

    it('returns a table of multiple elements sorted by link', function() {
      var links =[
            { link: '/foo', target: 'https://foo.com/', count: 1 },
            { link: '/bar', target: 'https://bar.com/', count: 2 },
            { link: '/baz', target: 'https://baz.com/', count: 3 }
          ],
          table = cl.createLinksTable(links, linksView),
          rows = table.getElementsByClassName('link')

      rows.length.should.equal(links.length)
      rows[0].getElementsByTagName('a')[0].textContent.should.equal('/bar')
      rows[1].getElementsByTagName('a')[0].textContent.should.equal('/baz')
      rows[2].getElementsByTagName('a')[0].textContent.should.equal('/foo')
    })

    it('returns a table of multiple elements sorted by clicks', function() {
      var links = [
              { link: '/foo', target: 'https://foo.com/', count: 1 },
              { link: '/bar', target: 'https://bar.com/', count: 2 },
              { link: '/baz', target: 'https://baz.com/', count: 3 }
          ],
          tableOptions = { sortKey: 'count', order: 'descending' },
          table = cl.createLinksTable(links, linksView, tableOptions),
          rows = table.getElementsByClassName('link')

      rows.length.should.equal(links.length)
      rows[0].getElementsByTagName('a')[0].textContent.should.equal('/baz')
      rows[1].getElementsByTagName('a')[0].textContent.should.equal('/bar')
      rows[2].getElementsByTagName('a')[0].textContent.should.equal('/foo')
    })

    it('raises an error for a bad sort order option', function() {
      expect(function() { cl.createLinksTable([], null, { order: 'bogus' }) })
        .to.throw(Error, 'invalid sort order: bogus')
    })
  })

  describe('linksView', function() {
    var origUserId = cl.userId,
        userId = 'mbland@acm.org',
        setApiResponseLinks

    beforeEach(function() {
      cl.userId = userId
      stubOut(console, 'error')
      stubOut(cl.backend, 'getUserInfo')
    })

    afterEach(function() {
      cl.userId = origUserId
    })

    setApiResponseLinks = function(links) {
      cl.backend.getUserInfo.withArgs(userId)
        .returns(Promise.resolve({ links: links }))
    }

    it('shows no links for a valid user', function() {
      setApiResponseLinks([])
      return cl.linksView().then(function(view) {
        var noLinksNotice = view.element.getElementsByClassName('no-links')[0],
            newLinkAnchor

        expect(noLinksNotice).to.not.be.undefined
        newLinkAnchor = noLinksNotice.getElementsByTagName('a')[0]
        expect(newLinkAnchor).to.not.be.undefined
        viewElementReceivesFocus(view, newLinkAnchor).should.equal(true)
        view.element.getElementsByClassName('total')[0].textContent
          .should.equal('')
      })
    })

    it('shows no links for cl.UNKNOWN_USER', function() {
      cl.userId = cl.UNKNOWN_USER
      cl.backend.getUserInfo.callThrough()
      return cl.linksView().then(function(view) {
        expect(view.element.getElementsByClassName('no-links')[0])
          .to.not.be.undefined
      })
    })

    it('shows a single link', function() {
      setApiResponseLinks([
        { link: '/foo', target: 'https://foo.com/', count: 1 }
      ])
      return cl.linksView().then(function(view) {
        var linksTable = view.element.getElementsByClassName('links')[0],
            rows,
            firstLink

        expect(linksTable).to.not.be.undefined
        rows = linksTable.getElementsByClassName('link')
        rows.length.should.equal(1)
        view.element.getElementsByClassName('total')[0].textContent
          .should.equal('1 link')

        firstLink = rows[0].getElementsByTagName('a')[0]
        firstLink.textContent.should.equal('/foo')
        expect(viewElementReceivesFocus(view, firstLink)).to.equal(true)
      })
    })

    it('shows multiple links', function() {
      setApiResponseLinks([
        { link: '/foo', target: 'https://foo.com/', count: 1 },
        { link: '/bar', target: 'https://bar.com/', count: 2 },
        { link: '/baz', target: 'https://baz.com/', count: 3 }
      ])
      return cl.linksView().then(function(view) {
        var linksTable = view.element.getElementsByClassName('links')[0],
            rows,
            firstLink

        expect(linksTable).to.not.be.undefined
        rows = linksTable.getElementsByClassName('link')
        rows.length.should.equal(3)
        view.element.getElementsByClassName('total')[0].textContent
          .should.equal('3 links')

        firstLink = rows[0].getElementsByTagName('a')[0]
        firstLink.textContent.should.equal('/bar')
        expect(viewElementReceivesFocus(view, firstLink)).to.equal(true)

        rows[1].getElementsByTagName('a')[0].textContent.should.equal('/baz')
        rows[2].getElementsByTagName('a')[0].textContent.should.equal('/foo')
      })
    })

    it('shows an error message when the backend call fails', function() {
      cl.backend.getUserInfo.withArgs(userId).returns(
        Promise.reject(new Error('simulated network error')))

      return cl.linksView().then(function(view) {
        var errorMsg = view.element.getElementsByClassName('result failure')[0]

        expect(errorMsg).to.not.be.undefined
        errorMsg.textContent.should.equal('simulated network error')
        console.error.args[0][0].message.should.equal('simulated network error')
      })
    })
  })

  describe('Dialog', function() {
    var dialog, resultElement, errPrefix, addTemplate, testTemplate, event

    beforeEach(function() {
      stubOut(console, 'error')
      resultElement = prepareFlashingElement(document.createElement('div'))
      errPrefix = 'The "test-template" dialog box template '
      testTemplate = addTemplate('test-template', [
        '<div class=\'test-dialog dialog\'>',
        '  <h3 class=\'title\'>Confirm update</h3>',
        '  <p class=\'description\'>',
        '    Update <span data-name=\'link\'></span>?',
        '  </p>',
        '  <button class=\'confirm focused\'>OK</button>',
        '  <button class=\'cancel\'>Cancel</button>',
        '</div>'
      ].join('\n'))

      dialog = new cl.Dialog('test-template', { link: '/foo' }, function() {
        return Promise.resolve('operation done')
      }, resultElement)
      event = {
        keyCode: null,
        shiftKey: false,
        preventDefault: function() { }
      }
      sinon.stub(event, 'preventDefault')
    })

    afterEach(function() {
      clTest.removeElement(testTemplate)
      clTest.removeElement(resultElement)

      if (dialog !== undefined) {
        // This also demonstrates that dialog.close() is idempotent, since this
        // call won't crash after other test cases that also call it.
        dialog.close()
      }
    })

    addTemplate = function(name, innerHTML) {
      var template = document.createElement('div')

      template.className = name + ' dialog'
      template.innerHTML = innerHTML
      document.getElementsByClassName('templates')[0].appendChild(template)
      cl.templates = null
      return template
    }

    it('creates an object from a valid dialog box template', function() {
      var link

      expect(dialog.element).to.not.be.undefined
      expect(dialog.element.parentNode).to.be.null
      expect(dialog.previousFocus).to.equal(document.activeElement)

      link = dialog.element.querySelector(['[data-name=link]'])
      expect(link).to.not.be.undefined
      expect(link.textContent).to.equal('/foo')
    })

    it('throws if the template doesn\'t contain a title', function() {
      var title = testTemplate.getElementsByClassName('title')[0]

      clTest.removeElement(title)
      expect(function() { return new cl.Dialog('test-template') })
        .to.throw(errPrefix + 'doesn\'t define a title element.')
    })

    it('throws if the template doesn\'t contain a description', function() {
      var description = testTemplate.getElementsByClassName('description')[0]

      clTest.removeElement(description)
      expect(function() { return new cl.Dialog('test-template') })
        .to.throw(errPrefix + 'doesn\'t define a description element.')
    })

    it('throws if the given template doesn\'t contain buttons', function() {
      var buttons = testTemplate.getElementsByTagName('button')

      while (buttons[0]) {
        clTest.removeElement(buttons[0])
      }
      expect(function() { return new cl.Dialog('test-template') })
        .to.throw(errPrefix + 'doesn\'t contain buttons.')
    })

    it('throws if no focused element defined', function() {
      var focused = testTemplate.getElementsByClassName('focused')[0]

      clTest.removeElement(focused)
      expect(function() { return new cl.Dialog('test-template') })
        .to.throw(errPrefix + 'doesn\'t define a focused element.')
    })

    it('throws if no confirm button is defined', function() {
      var confirm = testTemplate.getElementsByClassName('confirm')[0]

      // We only remove the 'confirm' class here.
      confirm.className = 'focused'
      expect(function() { return new cl.Dialog('test-template') })
        .to.throw(errPrefix + 'doesn\'t define a confirm button.')
    })

    it('throws if no cancel button is defined', function() {
      var cancel = testTemplate.getElementsByClassName('cancel')[0]

      clTest.removeElement(cancel)
      expect(function() { return new cl.Dialog('test-template') })
        .to.throw(errPrefix + 'doesn\'t define a cancel button.')
    })

    it('overrides confirm with cancel behavior for single button', function() {
      var confirm = testTemplate.getElementsByClassName('confirm')[0],
          cancel = testTemplate.getElementsByClassName('cancel')[0],
          operation = sinon.spy()

      clTest.removeElement(cancel)
      confirm.className += ' cancel'
      cancel = testTemplate.getElementsByClassName('cancel')[0]
      expect(cancel).to.equal(confirm)

      dialog = new cl.Dialog('test-template', {}, operation)
      spyOn(dialog, 'close')
      dialog.confirm.click()
      operation.called.should.be.false
      dialog.close.called.should.be.true
    })

    it('sets role and ARIA attributes on open', function() {
      expect(dialog.box.getAttribute('role')).to.be.null
      expect(dialog.box.getAttribute('aria-labelledby')).to.be.null
      expect(dialog.box.getAttribute('aria-describedby')).to.be.null
      expect(dialog.title.getAttribute('id')).to.be.null
      expect(dialog.description.getAttribute('id')).to.be.null

      dialog.open()
      expect(dialog.box.getAttribute('role')).to.equal('dialog')
      expect(dialog.box.getAttribute('aria-labelledby'))
        .to.equal('test-template-title')
      expect(dialog.box.getAttribute('aria-describedby'))
        .to.equal('test-template-description')
      expect(dialog.title.getAttribute('id'))
        .to.equal('test-template-title')
      expect(dialog.description.getAttribute('id'))
        .to.equal('test-template-description')
    })

    it('sets focus on open and restores focus on close', function() {
      dialog.open()
      expect(document.activeElement).to.equal(dialog.focused)
      expect(dialog.element.parentNode).to.equal(document.body)

      dialog.close()
      expect(document.activeElement).to.equal(dialog.previousFocus)
      expect(dialog.element.parentNode).to.be.null
    })

    it('performs the operation and closes the dialog on confirm', function() {
      dialog.open()
      expect(dialog.element.parentNode).to.equal(document.body)
      dialog.confirm.click()
      return dialog.operation.then(function() {
        expect(resultElement.textContent).to.equal('operation done')
        expect(dialog.element.parentNode).to.be.null
      })
    })

    it('closes the dialog when the cancel button is clicked', function() {
      dialog.open()
      expect(dialog.element.parentNode).to.equal(document.body)
      dialog.cancel.click()
      expect(resultElement.textContent).to.equal('')
      expect(dialog.element.parentNode).to.be.null
    })

    it('closes the dialog when the Escape key is pressed', function() {
      dialog.open()
      expect(dialog.element.parentNode).to.equal(document.body)
      event.keyCode = cl.KEY_ESC
      dialog.element.onkeydown(event)
      expect(dialog.element.parentNode).to.be.null
    })

    it('advances to the next button when Tab key is pressed', function() {
      dialog.open()
      expect(document.activeElement).to.equal(dialog.first)

      // Note that since KeyboardEvent isn't well-supported in most browsers, we
      // rely on checking that event.preventDefault() wasn't called, implying
      // that the keyboard focus proceeds normally.
      event.keyCode = cl.KEY_TAB
      dialog.element.onkeydown(event)
      event.preventDefault.called.should.be.false
    })

    it('shifts focus from first to last button on Shift+Tab', function() {
      dialog.open()
      expect(document.activeElement).to.equal(dialog.first)
      event.keyCode = cl.KEY_TAB
      event.shiftKey = true
      dialog.element.onkeydown(event)
      event.preventDefault.called.should.be.true
      expect(document.activeElement).to.equal(dialog.last)
    })

    it('shifts focus from last to first button on Tab', function() {
      dialog.open()
      dialog.last.focus()
      expect(document.activeElement).to.equal(dialog.last)
      event.keyCode = cl.KEY_TAB
      dialog.element.onkeydown(event)
      event.preventDefault.called.should.be.true
      expect(document.activeElement).to.equal(dialog.first)
    })

    describe('doOperation', function() {
      beforeEach(function() {
        dialog.open()
      })

      it('closes the dialog and flashes the result on success', function() {
        return dialog
          .doOperation(Promise.resolve('Success!'), resultElement)
          .then(function() {
            resultElement.textContent.should.equal('Success!')
            expect(resultElement.children[0]).to.not.be.undefined
            resultElement.children[0].className.should.equal('result success')
            expect(dialog.element.parentNode).to.be.null
          })
      })

      it('closes the dialog and flashes the result on failure', function() {
        return dialog
          .doOperation(Promise.reject('Failure!'), resultElement)
          .then(function() {
            resultElement.textContent.should.equal('Failure!')
            expect(resultElement.children[0]).to.not.be.undefined
            resultElement.children[0].className.should.equal('result failure')
            expect(dialog.element.parentNode).to.be.null
          })
      })
    })
  })
})
