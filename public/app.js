/* eslint-env browser */
'use strict';

(function(f) { f(window, document) })(function(window,  document) {
  var cl = window.cl = {}

  cl.UNKNOWN_USER = '<unknown user>'
  cl.KEY_TAB = 9
  cl.KEY_ESC = 27
  cl.CUSTOM_LINK_QUERY = 'link'
  cl.TARGET_URL_QUERY = 'target'
  cl.MIN_AUTOCOMPLETE_CHARACTERS = 3

  cl.xhr = function(method, url, body) {
    return new Promise(function(resolve, reject) {
      var r = new XMLHttpRequest()

      r.open(method, url, true)
      if (typeof body === 'object') {
        body = JSON.stringify(body)
        r.setRequestHeader('Content-Type', 'application/json')
      }
      if (url.match(/^\/api\//)) {
        r.responseType = 'json'
      }

      r.onreadystatechange = function() {
        if (this.readyState === 4) {
          if (this.status === 0) {
            this.onerror()
          } else if (this.status >= 200 && this.status < 300) {
            resolve(r)
          } else {
            reject(r)
          }
        }
      }
      r.onerror = function() {
        reject(new Error('A network error occurred. Please check your ' +
          'connection or contact the system administrator, then try again.'))
      }
      r.send(body)
    })
  }

  cl.createLinkInfo = function(link) {
    var trimmed = (link || '').replace(/^\/+/, ''),
        url = window.location.origin + '/' + trimmed

    return {
      trimmed: trimmed,
      relative: '/' + trimmed,
      full: url,
      anchor: '<a href=\'/' + trimmed + '\'>' + url + '</a>'
    }
  }

  cl.apiErrorMessage = function(xhrOrErr, linkInfo, prefix) {
    var response = xhrOrErr.response
    prefix += ': '

    if (xhrOrErr.status === undefined) {
      return prefix + (xhrOrErr.message || xhrOrErr)
    }
    if (xhrOrErr.status >= 500) {
      return prefix + 'A server error occurred. ' +
        'Please contact the system administrator or try again later.'
    }
    if (response) {
      return prefix + response.err.replace(linkInfo.relative, linkInfo.anchor)
    }
    return prefix + xhrOrErr.statusText
  }

  cl.Backend = function(xhr) {
    this.xhr = xhr
  }

  cl.Backend.prototype.getLoggedInUserId = function() {
    return this.xhr('GET', '/id')
      .then(function(xhr) { return xhr.response })
      .catch(function() { return cl.UNKNOWN_USER })
  }

  cl.Backend.prototype.makeApiCall = function(method, endpoint, linkInfo,
    params, okMsg, errPrefix) {
    endpoint = '/api/' + endpoint + (linkInfo.relative || '')
    return this.xhr(method, endpoint, params)
      .then(function(xhr) {
        return xhr.response || okMsg
      })
      .catch(function(xhrOrErr) {
        var err = new Error(cl.apiErrorMessage(xhrOrErr, linkInfo, errPrefix))
        err.xhr = xhrOrErr.status !== undefined ? xhrOrErr : undefined
        return Promise.reject(err)
      })
  }

  cl.Backend.prototype.getUserInfo = function(userId) {
    if (userId === cl.UNKNOWN_USER) {
      return Promise.resolve({})
    }
    return this.makeApiCall('GET', 'user/' + userId, {}, undefined, undefined,
      'Request for user info failed')
  }

  cl.Backend.prototype.createOrUpdate = function(link, target, action, errMsg) {
    link = cl.createLinkInfo(link)
    return this.makeApiCall('POST', action, link, { target: target },
      link.anchor + ' now redirects to ' + target, errMsg)
  }

  cl.Backend.prototype.createLink = function(link, target) {
    return this.createOrUpdate(link, target, 'create',
      'The link wasn\'t created')
  }

  cl.Backend.prototype.getLink = function(link) {
    link = cl.createLinkInfo(link)
    return this.makeApiCall('GET', 'info', link, undefined, undefined,
      'Failed to get link info for ' + link.relative)
  }

  cl.Backend.prototype.deleteLink = function(link) {
    link = cl.createLinkInfo(link)
    return this.makeApiCall('DELETE', 'delete', link, undefined,
      link.relative + ' has been deleted', link.relative + ' wasn\'t deleted')
  }

  cl.Backend.prototype.updateTarget = function(link, target) {
    return this.createOrUpdate(link, target, 'target',
      'The target URL wasn\'t updated')
  }

  cl.Backend.prototype.changeOwner = function(link, owner) {
    link = cl.createLinkInfo(link)
    return this.makeApiCall('POST', 'owner', link, { owner: owner },
      owner + ' now owns ' + link.anchor, 'Ownership wasn\'t transferred')
  }

  cl.Backend.prototype.searchLinks = function(queryType, searchString) {
    var query = queryType + '=' + searchString
    return this.makeApiCall('GET', 'search?' + query, {}, undefined, undefined,
      'Failed to execute search query: ' + query)
  }

  cl.Backend.prototype.completeLink = function(prefix) {
    var link = cl.createLinkInfo(prefix)
    return this.makeApiCall('GET', 'autocomplete', link, {},
      'failed to autocomplete prefix: ' + prefix)
  }

  cl.backend = new cl.Backend(cl.xhr)

  cl.loadApp = function() {
    window.onhashchange = function() {
      cl.showView(window.location.hash)
    }

    if (window.Promise === undefined) {
      var head = document.getElementsByTagName('HEAD')[0],
          js = document.createElement('script')
      js.type = 'text/javascript'
      js.src = 'vendor/es6-promise.auto.min.js'
      head.appendChild(js)
    }
    return cl.backend.getLoggedInUserId().then(function(id) {
      cl.userId = id
      document.getElementById('userid').textContent = id
      return cl.showView(window.location.hash)
    })
  }

  cl.getRoute = function(viewId){
    return {
      '#': cl.linksView,
      '#create': cl.createLinkView,
      '#edit': cl.editLinkView,
      '#search': cl.searchLinksView
    }[viewId]
  }

  cl.showView = function(hashId) {
    var viewId = hashId === '' ? '#' : hashId.split('-', 1)[0],
        viewParam = hashId.slice(viewId.length + 1),
        container = document.getElementsByClassName('view-container')[0],
        renderView = cl.getRoute(viewId)

    if (!renderView) {
      if (container.children.length !== 0) {
        return
      }
      renderView = cl.getRoute('#')
    }
    return renderView(viewParam)
      .then(function(view) {
        var replacement = container.cloneNode(false)

        replacement.appendChild(view.element)
        container.parentNode.replaceChild(replacement, container)
        view.done()
      })
      .catch(function(err) {
        console.error('View not updated for ' + hashId + ':', err)
      })
  }

  cl.View = function(element, done) {
    this.element = element
    this.done = done || function() { }
  }

  cl.getTemplate = function(templateName) {
    var template

    if (!cl.templates) {
      cl.templates = document.getElementsByClassName('templates')[0]
    }
    template = cl.templates.getElementsByClassName(templateName)[0]

    if (!template) {
      throw new Error('unknown template name: ' + templateName)
    }
    return template.cloneNode(true)
  }

  cl.applyData = function(data, element) {
    Object.keys(data).forEach(function(property) {
      var binding = element.querySelector('[data-name=' + property + ']')
      if (binding) {
        if (binding.tagName === 'INPUT') {
          binding.defaultValue = data[property]
        } else {
          binding.textContent = data[property]
        }
      }
    })
    return element
  }

  cl.createLinkView = function(link) {
    var linkForm = cl.getTemplate('create-view'),
        dropdown = new cl.Dropdown(linkForm.querySelector('[data-name=link]'),
          linkForm.getElementsByClassName('dropdown')[0],
          linkForm.querySelector('[data-name=target]')),
        button = linkForm.getElementsByTagName('button')[0]

    dropdown.addInputEventListeners()
    button.onclick = cl.createClickHandler(linkForm, 'createLink')
    link = cl.createLinkInfo(link)
    linkForm = cl.applyData({ link: link.trimmed }, linkForm)
    return Promise.resolve(new cl.View(linkForm, function() {
      linkForm.getElementsByTagName('input')[link.trimmed ? 1 : 0].focus()
    }))
  }

  cl.Dropdown = function(inputElement, dropdownElement, nextInputElement) {
    this.input = inputElement
    this.items = dropdownElement
    this.nextInput = nextInputElement
  }

  cl.Dropdown.prototype.addInputEventListeners = function() {
    this.input.addEventListener('keydown', this.createInputKeyDownListener())
    this.input.addEventListener('keyup', this.createInputKeyUpListener())
  }

  cl.Dropdown.prototype.show = function() {
    var style = this.items.style,
        inputStyle = window.getComputedStyle(this.input)

    style.display = 'block'
    style.marginTop = '-' + inputStyle.marginBottom
    style.width = inputStyle.width
  }

  cl.Dropdown.prototype.hide = function() {
    this.items.style = 'none'
  }

  cl.Dropdown.prototype.focus = function() {
    if (this.items.firstChild) {
      this.items.firstChild.focus()
    }
  }

  cl.Dropdown.prototype.createInputKeyDownListener = function() {
    var dropdown = this
    return function(e) {
      if (e.code === 'Enter') {
        e.preventDefault()
        dropdown.hide()
        dropdown.nextInput.focus()
      }
    }
  }

  cl.Dropdown.prototype.createInputKeyUpListener = function() {
    var dropdown = this

    return function(e) {
      if (e.code === 'Escape' || e.code === 'Enter') {
        dropdown.hide()
      } else if (cl.keyEvents.isEnterNextElement(e)) {
        dropdown.focus()
      } else {
        return dropdown.showLinkCompletions()
      }
    }
  }

  cl.Dropdown.prototype.showLinkCompletions = function() {
    var currentValue = this.input.value,
        dropdown = this

    if (!currentValue || currentValue.length < cl.MIN_AUTOCOMPLETE_CHARACTERS) {
      this.hide()
      return Promise.resolve()
    }
    return cl.backend.completeLink(currentValue)
      .then(function(response) {
        dropdown.update(response.results)
      })
      .catch(function(err) {
        console.error('autocomplete on "' + currentValue + '" failed:', err)
      })
  }

  cl.Dropdown.prototype.update = function(values) {
    var dropdown = this

    while (this.items.firstChild) {
      this.items.removeChild(this.items.firstChild)
    }
    if (values.length === 0 ||
      (values.length === 1 && values[0] === this.input.value)) {
      this.hide()
      return
    }
    values.map(function(value) {
      dropdown.add(value)
    })
    this.show()
  }

  cl.Dropdown.prototype.add = function(value) {
    var dropdown = this,
        input = this.input,
        element = document.createElement('li')

    element.textContent = value
    element.tabIndex = 0
    element.addEventListener('focus', function() {
      input.value = this.textContent
    })
    element.addEventListener('click', function() {
      input.value = this.textContent
      dropdown.hide()
      input.focus()
    })
    element.addEventListener('keydown', this.createItemListener(element))
    dropdown.items.appendChild(element)
  }

  cl.Dropdown.prototype.createItemListener = function(item) {
    var dropdown = this
    return function (e) {
      if (dropdown.escape(e) ||
        dropdown.next(e, item) || dropdown.previous(e, item)) {
        e.preventDefault()
      }
    }
  }

  cl.Dropdown.prototype.escape = function(keyEvent) {
    if (cl.keyEvents.isEscapeCurrentElement(keyEvent)) {
      this.hide()
      this.input.focus()
      return true
    }
  }

  cl.Dropdown.prototype.next = function(keyEvent, item) {
    if (cl.keyEvents.isSelectNextItem(keyEvent)) {
      if (item === this.items.lastChild) {
        this.items.firstChild.focus()
      } else {
        item.nextSibling.focus()
      }
      return true
    }
  }

  cl.Dropdown.prototype.previous = function(keyEvent, item) {
    if (cl.keyEvents.isSelectPreviousItem(keyEvent)) {
      if (item === this.items.firstChild) {
        this.items.lastChild.focus()
      } else {
        item.previousSibling.focus()
      }
      return true
    }
  }

  cl.keyEvents = {
    ESCAPE_KEYS: [ 'Backspace', 'Enter', 'Escape', 'Delete' ],
    NEXT_ELEMENT_KEYS: [ 'ArrowDown', 'ArrowRight' ],
    NEXT_ITEM_KEYS: [ 'KeyJ', 'KeyL', 'KeyS', 'KeyD' ],
    PREV_ELEMENT_KEYS: [ 'ArrowUp', 'ArrowLeft' ],
    PREV_ITEM_KEYS: [ 'KeyK', 'KeyH', 'KeyW', 'KeyA' ],

    isEscapeCurrentElement: function(keyEvent) {
      return cl.keyEvents.ESCAPE_KEYS.indexOf(keyEvent.code) !== -1
    },

    isEnterNextElement: function(keyEvent) {
      return cl.keyEvents.NEXT_ELEMENT_KEYS.indexOf(keyEvent.code) !== -1 ||
        (keyEvent.code === 'Tab' && !keyEvent.getModifierState('Shift')) ||
        (keyEvent.code === 'KeyN' && keyEvent.getModifierState('Control'))
    },

    isSelectNextItem: function(keyEvent) {
      return cl.keyEvents.NEXT_ITEM_KEYS.indexOf(keyEvent.code) !== -1 ||
        cl.keyEvents.isEnterNextElement(keyEvent)
    },

    isEnterPreviousElement: function(keyEvent) {
      return cl.keyEvents.PREV_ELEMENT_KEYS.indexOf(keyEvent.code) !== -1 ||
        (keyEvent.code === 'Tab' && keyEvent.getModifierState('Shift')) ||
        (keyEvent.code === 'KeyP' && keyEvent.getModifierState('Control'))
    },

    isSelectPreviousItem: function(keyEvent) {
      return cl.keyEvents.PREV_ITEM_KEYS.indexOf(keyEvent.code) !== -1 ||
        cl.keyEvents.isEnterPreviousElement(keyEvent)
    }
  }

  cl.editLinkView = function(link) {
    link = cl.createLinkInfo(link)

    if (link.trimmed === '') {
      cl.setLocationHref(window, '#')
      return Promise.reject(new Error('no link parameter supplied'))
    }
    return cl.backend.getLink(link.trimmed)
      .then(function(data) {
        if (data.owner !== cl.userId) {
          return Promise.resolve(new cl.errorView(
            link.anchor + ' is owned by ' + data.owner))
        }
        return cl.completeEditLinkView(data, link)
      })
      .catch(function(err) {
        if (err.xhr.status === 404) {
          cl.setLocationHref(window, '#create-' + link.relative)
          return Promise.reject(new Error(link.relative + ' doesn\'t exist'))
        }
        return Promise.resolve(cl.errorView(err.message))
      })
  }

  cl.searchLinksView = function() {
    var searchForm = cl.getTemplate('search-view'),
        buttons = searchForm.getElementsByTagName('button')

    buttons[0].onclick = cl.searchLinksClick(searchForm, cl.CUSTOM_LINK_QUERY)
    buttons[1].onclick = cl.searchLinksClick(searchForm, cl.TARGET_URL_QUERY)

    return Promise.resolve(new cl.View(searchForm, function() {
      searchForm.getElementsByTagName('input')[0].focus()
    }))
  }

  cl.searchLinksClick = function(searchForm, queryType) {
    return function(e) {
      e.preventDefault()
      return cl.searchLinks(searchForm, queryType,
        cl.getSearchQueryFromForm(searchForm, queryType))
    }
  }

  cl.getSearchQueryFromForm = function(searchForm) {
    var query = searchForm.querySelector('[data-name=query]')

    if (!query) {
      throw new Error('missing input field in search form: ' +
        searchForm.outerHTML)
    }
    return query.value.replace(/^\/+/, '')
  }

  cl.searchLinks = function(searchForm, queryType, searchString) {
    if (searchString.length === 0) {
      return Promise.resolve()
    }
    return cl.backend.searchLinks(queryType, searchString)
      .then(function(results) {
        if ((queryType === cl.CUSTOM_LINK_QUERY &&
            results.results.length === 0) ||
            Object.keys(results).length === 0) {
          return cl.getTemplate('search-no-results')
        }
        return cl.createSearchResultsTable(queryType, results)
      })
      .catch(function(err) {
        var errMessage = cl.getTemplate('result failure')

        errMessage.innerHTML = err.message
        return errMessage
      })
      .then(function(resultsElement) {
        var results = searchForm.getElementsByClassName('results')[0]
        return cl.flashElement(results, resultsElement.outerHTML)
      })
  }

  cl.createSearchResultsTable = function(queryType, results) {
    var params = {
      resultTable: cl.getTemplate('search-results'),
      entryTemplate: cl.getTemplate('search-result'),
      linkIndex: 0,
      targetIndex: 1
    }

    if (queryType === cl.TARGET_URL_QUERY) {
      cl.swapSearchResultTableHeaders(params.resultTable, params.entryTemplate)
      params.targetIndex = 0
      params.linkIndex = 1
      params.results = cl.transformTargetSearchResults(results)
    } else {
      params.results = results.results
    }
    return cl.fillSearchResultsTable(params)
  }

  cl.swapSearchResultTableHeaders = function(resultTable, entryTemplate) {
    // Swap the "Link" and "Target" fields in the results table.
    [ resultTable.getElementsByClassName('wrapper')[0],
      entryTemplate.getElementsByClassName('wrapper')[0]
    ].forEach(function(element) {
      element.insertBefore(element.getElementsByClassName('target')[0],
        element.getElementsByClassName('link')[0])
    })
  }

  // Transform the results object into the same format as that for a
  // custom link search.
  cl.transformTargetSearchResults = function(results) {
    // PhantomJS doesn't grok Object.values, hence Object.keys().map().
    return Object.keys(results)
      .map(function(key) { return results[key] })
      .reduce(function(flattened, links) {
        links.forEach(function(link) { flattened.push(link) })
        return flattened
      }, [])
  }

  cl.fillSearchResultsTable = function(params) {
    params.results.forEach(function(link) {
      var current = params.entryTemplate.cloneNode(true),
          cells = current.getElementsByClassName('cell')

      cells[params.linkIndex].appendChild(cl.createAnchor(link.link))
      cells[params.targetIndex].appendChild(cl.createAnchor(link.target))
      cells[2].textContent = cl.dateStamp(link.created)
      cells[3].textContent = cl.dateStamp(link.updated)
      cells[4].textContent = link.owner
      cells[5].textContent = link.clicks
      params.resultTable.appendChild(current)
    })
    return params.resultTable
  }

  cl.errorView = function(message) {
    var placeholder = document.createElement('div'),
        error = cl.getTemplate('result failure')

    error.innerHTML = message
    return new cl.View(placeholder, function() {
      cl.focusFirstElement(document.getElementsByClassName('nav')[0], 'a')
      return cl.flashElement(placeholder, error.outerHTML)
    })
  }

  cl.completeEditLinkView = function(origData, link) {
    var view = cl.getTemplate('edit-view'),
        forms = view.getElementsByTagName('form'),
        buttons = view.getElementsByTagName('button'),
        data = {
          link: link.relative,
          target: origData.target,
          clicks: origData.clicks,
          created: cl.dateStamp(origData.created),
          updated: cl.dateStamp(origData.updated),
          owner: origData.owner
        }

    cl.applyData(data, view)
    buttons[0].onclick = cl.createClickHandler(forms[0], 'updateTarget',
      { link: link.trimmed, original: data.target })
    buttons[1].onclick = function(e) {
      e.preventDefault()
      cl.changeOwner(forms[1], link, origData.owner)
    }
    return Promise.resolve(new cl.View(view, function() {
      cl.focusFirstElement(view, 'input')
      document.activeElement.setSelectionRange(0, data.target.length)
    }))
  }

  cl.updateTarget = function(view, data) {
    var target = view.querySelector('[data-name=target]').value

    if (target === data.original) {
      return Promise.resolve('The target URL remains the same.')
    }
    return cl.validateTarget(target) ||
      cl.backend.updateTarget(data.link, target)
  }

  cl.changeOwner = function(form, link, origOwner) {
    var owner = form.querySelector('[data-name=owner]').value,
        result = form.getElementsByClassName('result')[0],
        noChange

    if (owner === origOwner) {
      noChange = cl.getTemplate('result success')
      noChange.innerHTML = 'The owner remains the same.'
      return cl.flashElement(result, noChange.outerHTML)
    }
    cl.confirmTransfer(link, owner, result).open()
  }

  cl.confirmTransfer = function(link, newOwner, resultElement) {
    var data = { link: link.relative, owner: newOwner }

    return new cl.Dialog('confirm-transfer', data, function() {
      return cl.backend.changeOwner(link.trimmed, newOwner)
    }, resultElement)
  }

  cl.linksView = function() {
    var element = cl.getTemplate('links-view'),
        linksView = new cl.View(element, function() {
          cl.focusFirstElement(element, 'a')
        })

    linksView.numLinks = 0
    linksView.updateNumLinks = function(increment) {
      var numLinks = (linksView.numLinks += increment),
          result = numLinks + ' link' + (numLinks !== 1 ? 's' : '')
      cl.applyData({ 'num-links': result }, element)
    }

    return cl.backend.getUserInfo(cl.userId)
      .then(function(response) {
        if (response.links === undefined || response.links.length === 0) {
          return cl.getTemplate('no-links')
        }
        linksView.updateNumLinks(response.links.length)
        return cl.createLinksTable(response.links, linksView)
      })
      .catch(function(err) {
        var errMessage = cl.getTemplate('result failure')

        errMessage.innerHTML = err.message
        return errMessage
      })
      .then(function(resultElement) {
        linksView.element.appendChild(resultElement)
        return linksView
      })
  }

  cl.createLinksTable = function(links, linksView, options) {
    var linkTable = cl.getTemplate('links'),
        linkEntry = cl.getTemplate('link'),
        sortKey,
        order

    options = options || {}
    sortKey = options.sortKey || 'link'
    options.order = options.order || 'ascending'

    switch (options.order) {
    case 'ascending':
      order = 1
      break
    case 'descending':
      order = -1
      break
    default:
      throw new Error('invalid sort order: ' + options.order)
    }

    links.sort(function(lhs, rhs) {
      lhs = lhs[sortKey]
      rhs = rhs[sortKey]
      return lhs < rhs ? -order : (lhs > rhs ? order : 0)
    })
    links.forEach(function(link) {
      var current = linkEntry.cloneNode(true),
          cells = current.getElementsByClassName('cell'),
          actions = cells[5].getElementsByTagName('button')

      cells[0].appendChild(cl.createAnchor(link.link))
      cells[1].appendChild(cl.createAnchor(link.target))
      cells[2].textContent = cl.dateStamp(link.created)
      cells[3].textContent = cl.dateStamp(link.updated)
      cells[4].textContent = link.clicks
      actions[0].onclick = function(e) {
        e.preventDefault()
        cl.setLocationHref(window, '#edit-' + link.link)
      }
      actions[1].onclick = function(e) {
        e.preventDefault()
        cl.confirmDelete(link.link, current, linksView).open()
      }
      linkTable.appendChild(current)
    })
    return linkTable
  }

  cl.setLocationHref = function(window, href) {
    window.location.href = href
  }

  cl.dateStamp = function(timestamp) {
    var date = new Date(timestamp ? parseInt(timestamp) : 0)
    return date.toLocaleString().replace(/, /, ' ')
  }

  cl.fade = function(element, increment, deadline) {
    if (window.isNaN(increment) || increment === 0) {
      throw new Error('increment must be a nonzero number: ' + increment)

    } else if (window.isNaN(deadline) || deadline <= 0) {
      throw new Error('deadline must be a positive number: ' + deadline)
    }

    return new Promise(function(resolve) {
      var current = window.parseFloat(
            window.getComputedStyle(element)['opacity']),
          target = increment < 0.0 ? 0 : 1,
          interval = deadline * window.Math.abs(increment),
          style = element.style,
          doFade = function() {
            current += increment

            if ((increment < 0.0 && current <= target) ||
                (increment > 0.0 && current >= target)) {
              style.opacity = target
              resolve(element)
            } else {
              style.opacity = current
              setTimeout(doFade, interval)
            }
          }
      doFade()
    })
  }

  cl.flashElement = function(element, replacementHtml) {
    return cl.fade(element, -0.05, 150).then(function(elem) {
      elem.innerHTML = replacementHtml
      return cl.fade(element, 0.05, 250)
    })
  }

  cl.createLink = function(linkForm) {
    var link = linkForm.querySelector('[data-name=link]'),
        target = linkForm.querySelector('[data-name=target]')

    if (!link || !target) {
      throw new Error('fields missing from link form: ' + linkForm.outerHTML)
    }
    link = link.value.replace(/^\/+/, '')
    target = target.value

    if (link.length === 0) {
      return Promise.reject('Custom link field must not be empty.')
    }
    return cl.validateTarget(target) || cl.backend.createLink(link, target)
  }

  cl.createClickHandler = function(view, actionName, data) {
    return function(e) {
      e.preventDefault()
      return cl.flashResult(view.getElementsByClassName('result')[0],
        cl[actionName](view, data))
    }
  }

  cl.flashResult = function(element, action) {
    return action
      .then(function(message) {
        return { template: 'result success', message: message }
      })
      .catch(function(err) {
        return { template: 'result failure', message: (err.message || err) }
      })
      .then(function(resultData) {
        var result = cl.getTemplate(resultData.template)
        result.innerHTML = resultData.message
        return cl.flashElement(element, result.outerHTML)
          .then(function() {
            cl.focusFirstElement(element, 'a')
          })
      })
  }

  cl.Dialog = function(templateName, data, startOperation, resultElement) {
    var dialog = this,
        errPrefix = 'The "' + templateName + '" dialog box template '

    this.name = templateName
    this.box = cl.getTemplate(this.name)
    this.title = this.box.getElementsByClassName('title')[0]
    this.description = this.box.getElementsByClassName('description')[0]
    this.buttons = this.box.getElementsByTagName('button')
    this.focused = this.box.getElementsByClassName('focused')[0]
    this.confirm = this.box.getElementsByClassName('confirm')[0]
    this.cancel = this.box.getElementsByClassName('cancel')[0]

    if (this.title === undefined) {
      throw new Error(errPrefix + 'doesn\'t define a title element.')
    } else if (this.description === undefined) {
      throw new Error(errPrefix + 'doesn\'t define a description element.')
    } else if (this.buttons.length === 0) {
      throw new Error(errPrefix + 'doesn\'t contain buttons.')
    } else if (this.focused === undefined) {
      throw new Error(errPrefix + 'doesn\'t define a focused element.')
    } else if (this.confirm === undefined) {
      throw new Error(errPrefix + 'doesn\'t define a confirm button.')
    } else if (this.cancel === undefined) {
      throw new Error(errPrefix + 'doesn\'t define a cancel button.')
    }

    this.first = this.buttons[0]
    this.last = this.buttons[this.buttons.length - 1]
    cl.applyData(data, this.box)
    this.element = cl.getTemplate('dialog-overlay')
    this.element.appendChild(this.box)
    this.previousFocus = document.activeElement

    this.element.onkeydown = function(e) {
      dialog.handleKeyDown(e)
    }
    this.confirm.onclick = function(e) {
      e.preventDefault()
      dialog.operation = dialog.doOperation(startOperation(), resultElement)
    }
    this.cancel.onclick = function(e) {
      e.preventDefault()
      dialog.close()
    }
  }

  cl.Dialog.prototype.open = function() {
    var titleId = this.name + '-title',
        descriptionId = this.name + '-description'

    this.box.setAttribute('role', 'dialog')
    this.box.setAttribute('aria-labelledby', titleId)
    this.title.setAttribute('id', titleId)
    this.box.setAttribute('aria-describedby', descriptionId)
    this.description.setAttribute('id', descriptionId)

    document.body.appendChild(this.element)
    this.focused.focus()
  }

  cl.Dialog.prototype.close = function() {
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element)
      this.previousFocus.focus()
    }
  }

  cl.Dialog.prototype.handleKeyDown = function(e) {
    switch (e.keyCode) {
    case cl.KEY_TAB:
      if (e.shiftKey && document.activeElement === this.first) {
        e.preventDefault()
        this.last.focus()
      } else if (document.activeElement === this.last) {
        e.preventDefault()
        this.first.focus()
      }
      break
    case cl.KEY_ESC:
      this.close()
      break
    default:
      break
    }
  }

  cl.Dialog.prototype.doOperation = function(op, result) {
    var dialog = this

    return cl.flashResult(result,
      op.then(function(message) {
        dialog.close()
        return message
      })
      .catch(function(err) {
        dialog.close()
        return Promise.reject(err)
      })
    )
  }

  cl.confirmDelete = function(link, resultElement, linksView) {
    return new cl.Dialog('confirm-delete', { link: link }, function() {
      return cl.backend.deleteLink(link).then(function(result) {
        linksView.updateNumLinks(-1)
        return result
      })
    }, resultElement)
  }

  cl.createAnchor = function(link, text) {
    var anchor = document.createElement('a')

    anchor.appendChild(document.createTextNode(text || link))
    anchor.href = link
    return anchor
  }

  cl.focusFirstElement = function(parent, tag) {
    var first = parent.getElementsByTagName(tag)[0]
    if (first !== undefined) {
      first.focus()
    }
  }

  cl.validateTarget = function(target) {
    if (target.length === 0) {
      return Promise.reject('Target URL field must not be empty.')
    } else if (target.match(/https?:\/\//) === null) {
      return Promise.reject('Target URL protocol must be http:// or https://.')
    }
  }
})
