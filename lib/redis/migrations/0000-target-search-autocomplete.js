'use strict'

var PromiseHelper = require('../promise-helper')
var SearchHelper = require('../search-helper')
var AutocompleteIndexer = require('../autocomplete-indexer')
var TargetIndexer = require('../target-indexer')
var Keys = require('../keys')

module.exports = TargetSearchAndAutocompleteMigration

// Generates autocomplete and target URL search indexes from existing data.
function TargetSearchAndAutocompleteMigration(redisClient, log) {
  this.impl = redisClient
  this.log = log
}

TargetSearchAndAutocompleteMigration.prototype.migrate = function() {
  return new SearchHelper(this.impl, '*', Keys.SHORT_LINK_PREFIX).scan()
    .then(links => createAutocompleteIndex(this.impl, this.log, links))
    .then(links => createTargetUrlIndex(this.impl, this.log, links))
}

function createAutocompleteIndex(client, log, links) {
  var indexer = new AutocompleteIndexer(client)
  log.info('creating autocomplete index for custom links')
  return PromiseHelper.map(links, link => indexer.addLink(link))
    .then(() => links)
}

function createTargetUrlIndex(client, log, links) {
  var indexer = new TargetIndexer(client)
  log.info('creating search index for target URLs')
  return PromiseHelper
    .map(links, link => new Promise((res, rej) => {
      client.hgetall(link, (err, linkData) => err ? rej(err) : res(linkData))
    }))
    .then(results => PromiseHelper.map(results, (linkData, i) => {
      return indexer.addLink(links[i], linkData)
    }))
    .then(() => links)
}
