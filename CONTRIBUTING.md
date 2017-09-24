# Welcome!

I'm so glad you've found this project interesting and useful enough that you'd
like to contribute to its development.

Please take time to review the policies and procedures in this document prior
to making and submitting any changes.

This guide was drafted with tips from [Wrangling Web Contributions: How to Build
a CONTRIBUTING.md][moz] and with some inspiration from [the Atom project's
CONTRIBUTING.md file][atom].

[moz]:  https://mozillascience.github.io/working-open-workshop/contributing/
[atom]: https://github.com/atom/atom/blob/master/CONTRIBUTING.md

## Table of contents

- [Quick links](#quick-links)
- [Contributor License Agreement](#contributor-license-agreement)
- [Code of conduct](#code-of-conduct)
- [Reporting issues](#reporting-issues)
- [Updating documentation](#updating-documentation)
- [Environment setup](#environment-setup)
- [Workflow](#workflow)
- [Testing](#testing)
- [Open Source License](#open-source-license)

## Quick links

- [README](README.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [License information](LICENSE.md)
- [Original repository](https://github.com/mbland/custom-links)
- [Issues](https://github.com/mbland/custom-links/issues)
- [Pull requests](https://github.com/mbland/custom-links/pulls)
- [Milestones](https://github.com/mbland/custom-links/milestones)
- [Projects](https://github.com/mbland/custom-links/projects)

## Contributor License Agreement

Per the [GitHub Terms of Service][gh-tos], be aware that by making a
contribution to this project, you agree:

* to license your contribution under the same terms as [this project's
  license][lic], and
* that you have the right to license your contribution under those terms.

See also: ["Does my project need an additional contributor agreement? Probably
  not."][cla-needed]

[gh-tos]:     https://help.github.com/articles/github-terms-of-service/#6-contributions-under-repository-license
[lic]:        #open-source-license
[cla-needed]: https://opensource.guide/legal/#does-my-project-need-an-additional-contributor-agreement

## Code of conduct

Harrassment or rudeness of any kind will not be tolerated, period. For
specifics, see the [CODE_OF_CONDUCT](CODE_OF_CONDUCT.md) file.

## Reporting issues

Before reporting an issue, please use the search feature on the [issues
page][issues] to see if an issue matching the one you've observed has already
been filed.

If you do find one...

[issues]: https://github.com/mbland/custom-links/issues

### Do not add a +1 comment!

If you find an issue that interests you, but you have nothing material to
contribute to the thread, use the *Subscribe* button on the right side of the
page to receive notifications of further conversations or a resolution. Comments
consisting only of "+1" or the like tend to clutter the thread and make it more
painful to follow the discussion.

If you _do_ have something to add to the conversation, or _don't_ find a
matching issue...

### Update an existing issue or file a new one

Try to be as specific as possible about your environment and the problem you're
observing. At a minimum, include:

- The version of Node.js you're using, via `node --version`
- If the issue pertains to one of the scripts in the `scripts/` directory, the
  version of bash you're using, from either `bash --version` or `echo
  $BASH_VERSION`
- If possible, a code snippet, an automated test case, or command line steps
  that reproduce the issue

## Updating documentation

If you've a passion for writing clear, accessible documentation, please don't be
shy about sending pull requests! The documentation is just as important as the
code, especially in this project, since the goal is to make the functionality as
discoverable as possible through the `./go help` command.

Also: _no typo is too small to fix!_ Really. Of course, batches of fixes are
preferred, but even one nit is one nit too many.

## Environment setup

Make sure you have Node.js, Redis, and Bash installed per the [Installation
instructions in the README][installation].

[installation]: README.md#installation

You will also need [Git][] installed on your system. If you are not familiar
with Git, you may wish to reference the [Git documentation][git-doc].

[Git]:     https://git-scm.com/downloads
[git-doc]: https://git-scm.com/doc

## Workflow

The basic workflow for submitting changes resembles that of the [GitHub Git
Flow][git-flow], except that you will be working with your own fork of the
repository and issuing pull requests to the original.

[git-flow]: https://guides.github.com/introduction/flow/

1. Fork the repo on GitHub (look for the "Fork" button)
2. Clone your forked repo to your local machine
3. Create your feature branch (`git checkout -b my-new-feature`)
4. Develop _and [test](#testing)_ your changes as necessary.
4. Commit your changes (`git commit -am 'Add some feature'`)
5. Push to the branch (`git push origin my-new-feature`)
6. Create a new [GitHub pull request][gh-pr] for your feature branch based
   against the original repository's `master` branch
7. If your request is accepted, you can [delete your feature branch][rm-branch]
   and pull the updated `master` branch from the original repository into your
   fork. You may even [delete your fork][rm-fork] if you don't anticipate making
   further changes.

[gh-pr]:     https://help.github.com/articles/using-pull-requests/
[rm-branch]: https://help.github.com/articles/deleting-unused-branches/
[rm-fork]:   https://help.github.com/articles/deleting-a-repository/

## Testing

- Continuous integration status: [![Continuous integration status][ci-img]][ci]
- Coverage status: [![Coverage Status][cov-img]][cov]

[ci-img]:  https://img.shields.io/travis/mbland/custom-links/master.svg
[ci]:      https://travis-ci.org/mbland/custom-links
[cov-img]: https://img.shields.io/coveralls/mbland/custom-links/master.svg
[cov]:     https://coveralls.io/github/mbland/custom-links?branch=master

No bug fixes or new features will be accepted without accompanying tests.
Period.

Any changes that break the continuous integration build must be fixed or rolled
back immediately.

Before sending your code for review, make sure to run the entire test suite via
`./go test`. Run `./go test --coverage` to make sure your changes are adequately
covered by new and existing tests.

## Open Source License

This software is made available as [Open Source software][oss] under the [ISC
License][isc]. For the text of the license, see the [LICENSE](LICENSE.md) file.

[oss]: https://opensource.org/osd-annotated
[isc]: https://www.isc.org/downloads/software-support-policy/isc-license/
