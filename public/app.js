/* eslint-env browser */
'use strict';

(function(f) { f(window, document) })(function(window,  document) {
  var cl = window.cl = {}

  cl.UNKNOWN_USER = '<unknown user>'

  cl.xhr = function(method, url, body) {
    return new Promise(function(resolve, reject) {
      var r = new XMLHttpRequest()

      r.open(method, url, true)
      if (typeof body === 'object') {
        body = JSON.stringify(body)
        r.setRequestHeader('Content-Type', 'application/json')
        r.responseType = 'json'
      }

      r.onreadystatechange = function() {
        if (this.readyState === 4) {
          this.status >= 200 && this.status < 300 ? resolve(r) : reject(r)
        }
      }
      r.onerror = function() {
        reject(new Error('A network error occurred. Please check your ' +
          'connection or contact the system administator, then try again.'))
      }
      r.send(body)
    })
  }

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
    cl.userId = cl.xhr('GET', '/id')
      .then(function(xhr) { return xhr.response })
      .catch(function() { return cl.UNKNOWN_USER })

    return cl.userId.then(function(id) {
      document.getElementById('userid').textContent = id
      return cl.showView(window.location.hash)
    })
  }

  cl.showView = function(hashId) {
    var viewId = hashId === '' ? '#' : hashId.split('-', 1),
        viewParam = hashId.slice(viewId.length + 1),
        container = document.getElementsByClassName('view-container')[0],
        routes = {
          '#': cl.landingView,
          '#links': cl.linksView
        },
        renderView = routes[viewId]

    if (!renderView) {
      if (container.children.length !== 0) {
        return
      }
      renderView = routes['#']
    }
    return renderView(viewParam).then(function(view) {
      var replacement = container.cloneNode(false)

      replacement.appendChild(view.element)
      container.parentNode.replaceChild(replacement, container)

      if (view.done) {
        return view.done()
      }
    })
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

  cl.landingView = function() {
    var view = cl.getTemplate('landing-view'),
        editForm = cl.getTemplate('edit-link'),
        button = editForm.getElementsByClassName('button')[0]

    button.onclick = cl.createLinkClick
    view.appendChild(cl.applyData({ submit: 'Create URL' }, editForm))
    return Promise.resolve({
      element: view,
      done: function() {
        cl.focusFirstElement(view, 'input')
      }
    })
  }

  cl.linksView = function() {
    var linksView = cl.getTemplate('link-view')

    return cl.userId
      .then(function(uid) {
        if (uid === cl.UNKNOWN_USER) {
          return { response: '{}' }
        }
        return cl.xhr('GET', '/api/user/' + uid).catch(function(err) {
          throw new Error('Request for user info failed: ' +
            (err.message || err.statusText))
        })
      })
      .then(function(result) {
        var response

        try {
          response = JSON.parse(result.response)
        } catch (err) {
          console.error('Bad user info response:', result.response)
          throw new Error('Failed to parse user info response: ' +
            err.message + '<br/>See console messages for details.')
        }

        if (response.urls === undefined || response.urls.length === 0) {
          linksView.appendChild(cl.getTemplate('no-links'))
        } else {
          linksView.appendChild(cl.createLinksTable(response.urls))
        }
      })
      .catch(function(err) {
        var errMessage = cl.getTemplate('result failure')

        console.error(err)
        errMessage.innerHTML = err.message
        linksView.appendChild(errMessage)
      })
      .then(function() {
        return {
          element: linksView,
          done: function() {
            cl.focusFirstElement(linksView, 'a')
          }
        }
      })
  }

  cl.createLinksTable = function(links, options) {
    var linkTable = cl.getTemplate('links'),
        linkEntry = cl.getTemplate('link'),
        sortKey,
        order

    options = options || {}
    sortKey = options.sortKey || 'url'
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
          cells = current.getElementsByClassName('cell')

      cells[0].appendChild(cl.createAnchor(link.url))
      cells[1].appendChild(cl.createAnchor(link.location))
      cells[2].textContent = link.count
      linkTable.appendChild(current)
    })
    return linkTable
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
    var url = linkForm.querySelector('[data-name=url]'),
        location = linkForm.querySelector('[data-name=location]'),
        resultUrl,
        resultAnchor

    if (!url || !location) {
      throw new Error('fields missing from link form: ' + linkForm.outerHTML)
    }
    url = url.value.replace(/^\/+/, '')
    location = location.value
    resultUrl = window.location.origin + '/' + url
    resultAnchor = '<a href=\'/' + url + '\'>' + resultUrl + '</a>'

    if (url.length === 0) {
      return Promise.reject('Custom link field must not be empty.')
    } else if (location.length === 0) {
      return Promise.reject('Redirect location field must not be empty.')
    } else if (location.match(/https?:\/\//) === null) {
      return Promise.reject('Redirect location protocol must be ' +
        'http:// or https://.')
    }

    return cl.xhr('POST', '/api/create/' + url, { location: location })
      .then(function() {
        return resultAnchor + ' now redirects to ' + location
      })
      .catch(function(err) {
        if (err.status === undefined) {
          return Promise.reject(err.message || err)
        }
        if (err.status >= 500) {
          return Promise.reject('A server error occurred and ' +
            resultUrl + ' wasn\'t created. Please contact the system ' +
            'administrator or try again later.')
        }
        if (err.response) {
          return Promise.reject(err.response.err.replace(
            '/' + url, resultAnchor))
        }
        return Promise.reject('Could not create ' + resultUrl + ': ' +
          err.statusText)
      })
  }

  cl.createLinkClick = function() {
    var linkForm = this.parentNode,
        resultFlash = linkForm.getElementsByClassName('result')[0]

    resultFlash.done = cl.createLink(linkForm)
      .then(function(message) {
        return { template: 'result success', message: message }
      })
      .catch(function(err) {
        return { template: 'result failure', message: (err.message || err) }
      })
      .then(function(resultData) {
        var result = cl.getTemplate(resultData.template)
        result.innerHTML = resultData.message
        return cl.flashElement(resultFlash, result.outerHTML)
          .then(function() {
            cl.focusFirstElement(resultFlash, 'a')
          })
      })
    return false
  }

  cl.createAnchor = function(url, text) {
    var anchor = document.createElement('a')

    anchor.appendChild(document.createTextNode(text || url))
    anchor.href = url
    return anchor
  }

  cl.focusFirstElement = function(parent, tag) {
    var first = parent.getElementsByTagName(tag)[0]
    if (first !== undefined) {
      first.focus()
    }
  }
})
