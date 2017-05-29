#! /usr/bin/env bash
#
# Serverless system for creating custom URLs
#
# Allows authenticated users to create and access custom URLs that redirect to
# arbitrary targets.

# The path where your command scripts reside
declare GO_SCRIPTS_DIR="${GO_SCRIPTS_DIR:-scripts}"

# The `GO_SCRIPT_BASH_REPO_URL` tag or branch you wish to use
declare GO_SCRIPT_BASH_VERSION="${GO_SCRIPT_BASH_VERSION:-v1.4.0}"

# The go-script-bash installation directory within your project
declare GO_SCRIPT_BASH_CORE_DIR="${GO_SCRIPT_BASH_CORE_DIR:-${0%/*}/$GO_SCRIPTS_DIR/go-script-bash}"

# The URL of the go-script-bash framework sources
declare GO_SCRIPT_BASH_REPO_URL="${GO_SCRIPT_BASH_REPO_URL:-https://github.com/mbland/go-script-bash.git}"

if [[ ! -e "$GO_SCRIPT_BASH_CORE_DIR/go-core.bash" ]]; then
  printf "Cloning framework from '%s'...\n" "$GO_SCRIPT_BASH_REPO_URL"
  if ! git clone --depth 1 -c advice.detachedHead=false \
      -b "$GO_SCRIPT_BASH_VERSION" "$GO_SCRIPT_BASH_REPO_URL" \
      "$GO_SCRIPT_BASH_CORE_DIR"; then
    printf "Failed to clone '%s'; aborting.\n" "$GO_SCRIPT_BASH_REPO_URL" >&2
    exit 1
  fi
  printf "Clone of '%s' successful.\n\n" "$GO_SCRIPT_BASH_REPO_URL"
fi

. "$GO_SCRIPT_BASH_CORE_DIR/go-core.bash" "$GO_SCRIPTS_DIR"

export PATH="node_modules/.bin:$PATH"

# Keep this until the following is resolved:
# https://github.com/mbland/go-script-bash/issues/176
if [[ "$OSTYPE" == 'msys' ]]; then
  export MSYS_NO_PATHCONV='true'
  export MSYS2_ARG_CONV_EXCL='*'
fi

if [[ -t 1 || -n "$TRAVIS" ]]; then
  _GO_LOG_FORMATTING='true'
fi

. "$_GO_USE_MODULES" 'log'

if [[ ! -d "$_GO_ROOTDIR/node_modules" ]]; then
  @go.setup_project 'setup'
  if [[ "$#" -eq '0' ]]; then
    exit
  fi
fi

@go "$@"
