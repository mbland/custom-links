#! /usr/bin/env bash
#
# System for creating custom URLs
#
# Allows authenticated users to create and access custom links that redirect to
# arbitrary target URLs.
#
# See .config/env.template for instructions on setting environment variables to
# configure your local development environment.

# The path where your command scripts reside
declare GO_SCRIPTS_DIR="${GO_SCRIPTS_DIR:-scripts}"

# The `GO_SCRIPT_BASH_REPO_URL` tag or branch you wish to use
declare GO_SCRIPT_BASH_VERSION="${GO_SCRIPT_BASH_VERSION:-v1.7.0}"

# The go-script-bash installation directory within your project
declare GO_SCRIPT_BASH_CORE_DIR="${GO_SCRIPT_BASH_CORE_DIR:-${0%/*}/$GO_SCRIPTS_DIR/go-script-bash}"

# The URL of the go-script-bash framework sources
declare GO_SCRIPT_BASH_REPO_URL="${GO_SCRIPT_BASH_REPO_URL:-https://github.com/mbland/go-script-bash.git}"

# URL with the release files
declare GO_SCRIPT_BASH_DOWNLOAD_URL="${GO_SCRIPT_BASH_DOWNLOAD_URL:-${GO_SCRIPT_BASH_REPO_URL%.git}/archive}/$GO_SCRIPT_BASH_VERSION.tar.gz"

# Downloads `GO_SCRIPT_BASH_VERSION` as a tar.gz file and unpacks it.
download_go_script_bash_tarball() {
  # GitHub removes the leading 'v' from the archive's output directory.
  local unpacked_dir="go-script-bash-${GO_SCRIPT_BASH_VERSION#v}"
  local core_dir_parent="${GO_SCRIPT_BASH_CORE_DIR%/*}"
  local url="$GO_SCRIPT_BASH_DOWNLOAD_URL"
  local protocol="${url%%://*}"
  local download_cmd=()

  if [[ "$protocol" == "$url" ]]; then
    printf 'GO_SCRIPT_BASH_DOWNLOAD_URL has no protocol: %s\n' "$url" >&2
    return 1
  elif [[ "$(git --version)" =~ windows && "$protocol" == 'file' ]]; then
    url="file://$(cygpath -m "${url#file://}")"
  fi

  if command -v curl >/dev/null; then
    download_cmd=(curl -LfsS "$url")
  elif command -v fetch >/dev/null; then
    download_cmd=(fetch -o - "$url")
  elif [[ "$protocol" == 'file' ]] && command -v cat; then
    # `wget` can't handle 'file://' urls. Though input redirection would work
    # below, this method is consistent with the process substitution logic.
    download_cmd=(cat "${url#file://}")
  elif command -v wget >/dev/null; then
    download_cmd=(wget -O - "$url")
  else
    printf "Failed to find cURL, wget, or fetch\n" >&2
    return 1
  fi

  if ! command -v tar >/dev/null; then
    printf "Failed to find tar\n" >&2
    return 1
  fi
  printf "Downloading framework from '%s'...\n" "$url"

  if ! "${download_cmd[@]}" | tar -xzf - ||
    [[ "${PIPESTATUS[0]}" -ne '0' ]]; then
    printf "Failed to download from '%s'.\n" "$url" >&2
    return 1
  elif [[ ! -d "$core_dir_parent" ]] && ! mkdir -p "$core_dir_parent" ; then
    printf "Failed to create scripts dir '%s'\n" "$core_dir_parent" >&2
    rm -rf "$unpacked_dir"
    return 1
  elif ! mv "$unpacked_dir" "$GO_SCRIPT_BASH_CORE_DIR"; then
    printf "Failed to install downloaded directory in '%s'\n" \
      "$GO_SCRIPT_BASH_CORE_DIR" >&2
    rm -rf "$unpacked_dir"
    return 1
  fi
  printf "Download of '%s' successful.\n\n" "$url"
}

git_clone_go_script_bash() {
  printf "Cloning framework from '%s'...\n" "$GO_SCRIPT_BASH_REPO_URL"
  if ! git clone --depth 1 -c advice.detachedHead=false \
      -b "$GO_SCRIPT_BASH_VERSION" "$GO_SCRIPT_BASH_REPO_URL" \
      "$GO_SCRIPT_BASH_CORE_DIR"; then
    printf "Failed to clone '%s'; aborting.\n" "$GO_SCRIPT_BASH_REPO_URL" >&2
    return 1
  fi
  printf "Clone of '%s' successful.\n\n" "$GO_SCRIPT_BASH_REPO_URL"
}

if [[ ! -e "$GO_SCRIPT_BASH_CORE_DIR/go-core.bash" ]]; then
  if ! download_go_script_bash_tarball; then
    printf "Using git clone as fallback\n"
    if ! git_clone_go_script_bash; then
      exit 1
    fi
  fi
fi

. "$GO_SCRIPT_BASH_CORE_DIR/go-core.bash" "$GO_SCRIPTS_DIR"

export PATH="node_modules/.bin:$PATH"

if [[ -t 1 || -n "$TRAVIS" ]]; then
  _GO_LOG_FORMATTING='true'
fi

. "$_GO_USE_MODULES" 'log'

if [[ -f "$_GO_ROOTDIR/.config/env.local" ]]; then
  . "$_GO_ROOTDIR/.config/env.local"
fi

if [[ ! -d "$_GO_ROOTDIR/node_modules" ]]; then
  @go.setup_project 'setup'
  if [[ "$#" -eq '0' ]]; then
    exit
  fi
fi

@go "$@"
