'use strict'

var path = require('path')
var express = require('express')

module.exports = {
  assembleApp: assembleApp
}

function assembleApp(redirectDb, app) {
  app.use(express.static(path.join(__dirname, '..', 'public')))

  app.get('/*', function(req, res) {
    redirectDb.fetchRedirect(req.originalUrl)
      .then(function(location) {
        res.redirect(location)
      })
      .catch(function(err) {
        res.status(500)
        res.send('Error while processing ' + req.originalUrl + ': ' + err)
      })
  })

  /*
  app.post('/', function(req, res) {
  })

  app.put('/', function(req, res) {
  })
  */
}
