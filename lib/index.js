'use strict'

var auth = require('./auth')
var path = require('path')
var express = require('express')
var session = require('express-session')
var passport = require('passport')
var ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn
var bodyParser = require('body-parser')

module.exports = exports = {
  assembleApp: assembleApp,
  sessionParams: sessionParams,

  // Default to one-week long sessions
  DEFAULT_SESSION_MAX_AGE: 86400 * 7
}

function sessionParams(config, sessionStore) {
  var maxAge = config.SESSION_MAX_AGE,
      doResave

  if (maxAge === undefined) {
    maxAge = exports.DEFAULT_SESSION_MAX_AGE
  } else if (maxAge !== null && maxAge < 0) {
    throw new Error('SESSION_MAX_AGE cannot be negative: ' + maxAge)
  }
  sessionStore = sessionStore || null
  doResave = sessionStore === null || sessionStore.touch === undefined

  return {
    store: sessionStore,
    secret: config.SESSION_SECRET,
    resave: doResave,
    saveUninitialized: doResave,
    maxAge: maxAge === null ? null : maxAge * 1000
  }
}

function assembleApp(app, linkDb, logger, sessionStore, config) {
  auth.assemble(passport, linkDb, config)
  app.use(session(sessionParams(config, sessionStore)))
  app.use(passport.initialize())
  app.use(passport.session())

  app.get('/auth',
    passport.authenticate(config.AUTH_PROVIDERS,
      { scope: [ 'profile', 'email' ] }))
  app.get('/auth/callback',
    passport.authenticate(config.AUTH_PROVIDERS,
      { failureRedirect: '/auth', successReturnToOrRedirect: '/' }))

  app.get('/logout', (req, res) => {
    req.logout()
    res.redirect('/auth')
  })

  app.use('/', ensureLoggedIn('/auth'))
  app.use(express.static(path.join(__dirname, '..', 'public')))
  app.get('/id', (req, res) => res.status(200).send(req.user.id))
  app.use('/api', assembleApiRouter(linkDb, logger))

  app.get('/*', (req, res) => {
    linkDb.getLink(req.path, { recordAccess: true })
      .then(link => {
        res.redirect(link !== null ? link.target : '/#create-' + req.path)
      })
      .catch(errorHandler(req, res, logger))
  })
  return app
}

function errorHandler(req, res, logger, method) {
  return err => {
    var response
    logger.error(err)

    if (err instanceof Error) {
      res.sendStatus(500)
    } else {
      response = (method === 'json') ? { err: err } : err
      res.status(403)[method || 'send'](response)
    }
  }
}

function sendOK(res, status) {
  return () => res.sendStatus(status)
}

function addApiHandlers(req, res, okStatus, logger, linkDbOp) {
  linkDbOp.then(sendOK(res, okStatus))
    .catch(errorHandler(req, res, logger, 'json'))
}

function assembleApiRouter(linkDb, logger) {
  var router = express.Router(),
      jsonParser = bodyParser.json(),
      linkParam = ':link(/[A-Za-z0-9_.-]+)',
      userParam = ':user([A-Za-z0-9_.-]+@?[A-Za-z0-9_.-]+)'

  router.get('/info' + linkParam, (req, res) => {
    linkDb.getLink(req.params.link)
      .then(linkInfo => {
        if (linkInfo !== null) {
          res.status(200)
          res.json(linkInfo)
        } else {
          res.sendStatus(404)
        }
      })
      .catch(errorHandler(req, res, logger, 'json'))
  })

  router.post('/create' + linkParam, jsonParser, (req, res) => {
    addApiHandlers(req, res, 201, logger, linkDb.createLink(
      req.params.link, req.body.target, req.user.id))
  })

  router.get('/user/' + userParam, (req, res) => {
    linkDb.getOwnedLinks(req.params.user)
      .then(links => {
        res.status(200)
        res.json({ links: links })
      })
      .catch(err => {
        logger.error(err)
        res.sendStatus(err instanceof Error ? 500 : 404)
      })
  })

  router.post('/owner' + linkParam, jsonParser, (req, res) => {
    addApiHandlers(req, res, 204, logger, linkDb.changeOwner(
      req.params.link, req.user.id, req.body.owner))
  })

  router.post('/target' + linkParam, jsonParser, (req, res) => {
    addApiHandlers(req, res, 204, logger, linkDb.updateTarget(
      req.params.link, req.user.id, req.body.target))
  })

  router.delete('/delete' + linkParam, (req, res) => {
    addApiHandlers(req, res, 204, logger, linkDb.deleteLink(
      req.params.link, req.user.id))
  })

  router.get('/search', (req, res) => {
    var search

    if (req.query.link) {
      search = linkDb.searchShortLinks(req.query.link)
    } else if (req.query.target) {
      search = linkDb.searchTargetLinks(req.query.target)
    } else {
      res.status(400)
    }

    search.then(results => {
      res.status(200).json(results)
    }).catch(errorHandler(req, res, logger, 'json'))
  })

  router.all('/*', (req, res) => res.sendStatus(400))

  return router
}
