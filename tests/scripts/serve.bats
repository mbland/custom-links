#! /usr/bin/env bats

load environment

setup() {
  test_filter

  # These can be in the config file
  export CUSTOM_LINKS_PORT="$(tests/helpers/pick-unused-port)"
  export CUSTOM_LINKS_AUTH_PROVIDERS='test'
  export CUSTOM_LINKS_SESSION_SECRET='s3kr3t'
  export CUSTOM_LINKS_REDIS_PORT="$(tests/helpers/pick-unused-port)"

  # These must be given as environment variables.
  export CUSTOM_LINKS_TEST_AUTH='mbland@acm.org'
  export CUSTOM_LINKS_REDIS_DIR="${BATS_TEST_ROOTDIR}/redis-test"
  export CUSTOM_LINKS_REDIS_LOG_PATH="${CUSTOM_LINKS_REDIS_DIR}/redis.log"
  create_bats_test_dirs 'redis-test'
  create_config_file
}

teardown() {
  stop_background_run
  stop_local_redis
  remove_bats_test_dirs
}

# Creates a new config file from a list of `jq` commands.
create_config_file() {
  local init='{ "domains": [ "acm.org" ] }'
  local filters=''
  local origIFS="$IFS"

  if [[ "$#" -ne 0 ]]; then
    IFS='|'
    filters="$*"
    IFS="$origIFS"
  fi

  export CUSTOM_LINKS_CONFIG_PATH="${BATS_TEST_ROOTDIR}/test-config.json"
  printf "$init" | jq "$filters" > "$CUSTOM_LINKS_CONFIG_PATH"
}

start_local_redis() {
  redis-server --port "$CUSTOM_LINKS_REDIS_PORT" \
    --dir "$CUSTOM_LINKS_REDIS_DIR" >/dev/null 2>&1 &
  export CUSTOM_LINKS_LOCAL_REDIS_PID="$!"
}

stop_local_redis() {
  if [[ -n "$CUSTOM_LINKS_LOCAL_REDIS_PID" ]]; then
    kill "$CUSTOM_LINKS_LOCAL_REDIS_PID" >/dev/null 2>&1
  fi
}

# Equivalent to the Bats `run` function for background processes.
#
# After calling this function, you can use `wait_for_background_output` to wait
# for the process to enter an expected state, then call `stop_background_run` to
# end the process and set the `output`, `lines`, and `status` variables.
#
# Arguments:
#   $@:  Command to run as a background process
#
# Globals set by this function:
#   BATS_BACKGROUND_RUN_OUTPUT:  File into which process output is collected
#   BATS_BACKGROUND_RUN_PID:     Process ID of the background process
run_in_background() {
  set "$DISABLE_BATS_SHELL_OPTIONS"
  export BATS_BACKGROUND_RUN_OUTPUT="$BATS_TMPDIR/background-run-output.txt"
  printf '' >"$BATS_BACKGROUND_RUN_OUTPUT"
  "$@" >"$BATS_BACKGROUND_RUN_OUTPUT" 2>&1 &
  export BATS_BACKGROUND_RUN_PID="$!"
  restore_bats_shell_options
}

# Pauses test execution until a background process produces expected output.
#
# Call this after `run_in_background` to ensure the process enters an expected
# state before continuing with the test.
#
# Arguments:
#   pattern:  Regular expression matching output signifying expected state
#   timeout:  Timeout for the wait operation in seconds
#
# Globals set by `run_in_background`:
#   BATS_BACKGROUND_RUN_OUTPUT:  File into which process output is collected
#
# External programs:
#   pkill
#   sleep
#   tail
wait_for_background_output() {
  set "$DISABLE_BATS_SHELL_OPTIONS"
  local pattern="$1"
  local timeout="${2:-3}"
  local input_cmd=('tail' '-f' "$BATS_BACKGROUND_RUN_OUTPUT")
  local kill_input_pid='0'
  local line

  if [[ -z "$pattern" ]]; then
    printf 'pattern not specified\n' >&2
    restore_bats_shell_options '1'
    return
  fi

  # Since `tail -f` will block forever, even if the background process died, we
  # kill it automatically after a timeout period.
  (sleep "$timeout"; pkill -f "${input_cmd[*]}" >/dev/null 2>&1) &
  kill_input_pid="$!"

  while read -r line; do
    if [[ "$line" =~ $pattern ]]; then
      # Kill the sleep so `pkill -f 'tail -f'` will run sooner.
      pkill -P "$kill_input_pid" sleep
      restore_bats_shell_options
      return
    fi
  done < <("${input_cmd[@]}")

  printf 'Output did not match regular expression:\n  %s\n\n' "$pattern" >&2
  printf 'OUTPUT:\n------\n%s' "$(< "$BATS_BACKGROUND_RUN_OUTPUT")" >&2
  restore_bats_shell_options '1'
}

# Terminates the background process launched by `run_in_background`.
#
# Also sets `output`, `lines`, and `status`, though `lines` preserves empty
# lines from `output`.
#
# Arguments:
#   signal (optional):  Signal to send to the process; defaults to TERM
#
# Globals set by `run_in_background`:
#   BATS_BACKGROUND_RUN_OUTPUT:  File into which process output is collected
#   BATS_BACKGROUND_RUN_PID:     Process ID of the background process
#
# External programs:
#   kill
#   rm
stop_background_run() {
  set "$DISABLE_BATS_SHELL_OPTIONS"
  local signal="${1:-TERM}"

  if [[ -n "$BATS_BACKGROUND_RUN_PID" ]]; then
    kill "-${signal}" "$BATS_BACKGROUND_RUN_PID" >/dev/null 2>&1
    wait "$BATS_BACKGROUND_RUN_PID"
    status="$?"
    output="$(<"$BATS_BACKGROUND_RUN_OUTPUT")"
    rm "$BATS_BACKGROUND_RUN_OUTPUT"
    unset BATS_BACKGROUND_RUN_{PID,OUTPUT}
    split_bats_output_into_lines
  fi
  restore_bats_shell_options
}

@test "$SUITE: tab completion" {
  run ./go complete 1 serve 'test'
  assert_success 'test-config.json' 'tests/'

  run ./go complete 1 serve 'test-'
  assert_success 'test-config.json '

  run ./go complete 2 serve 'test-config.json' ''
  assert_failure ''
}

@test "$SUITE: launches redis-server in background from environment variables" {
  run_in_background ./go serve
  wait_for_background_output "custom-links listening on port $CUSTOM_LINKS_PORT"
  stop_background_run

  if [[ ! -f "$CUSTOM_LINKS_REDIS_DIR/appendonly.aof" ]]; then
    fail 'Append only file not created'
  fi

  assert_output_matches 'INFO +redis-server running'
  assert_output_matches 'INFO +custom-links server shutdown complete'
  assert_output_matches 'RUN  +Shutting down redis-server'
  assert_output_matches 'INFO +redis-server shutdown complete'
}

@test "$SUITE: launches redis-server in background from config file" {
  create_config_file ".PORT=$CUSTOM_LINKS_PORT" \
    '.AUTH_PROVIDERS=["test"]' \
    ".SESSION_SECRET=\"$CUSTOM_LINKS_SESSION_SECRET\"" \
    ".REDIS_PORT=$CUSTOM_LINKS_REDIS_PORT"
  unset CUSTOM_LINKS_{PORT,AUTH_PROVIDERS,SESSION_SECRET,REDIS_PORT}

  run_in_background ./go serve
  wait_for_background_output "custom-links listening on port $CUSTOM_LINKS_PORT"
  stop_background_run

  assert_output_matches 'INFO +custom-links server shutdown complete'
  assert_output_matches 'INFO +redis-server shutdown complete'
}

@test "$SUITE: uses redis-server that's already running" {
  start_local_redis
  run_in_background ./go serve
  wait_for_background_output "custom-links listening on port $CUSTOM_LINKS_PORT"
  stop_background_run

  fail_if output_matches 'INFO +redis-server running'
  assert_output_matches 'INFO +custom-links server shutdown complete'
  fail_if output_matches 'RUN  +Shutting down redis-server'
  fail_if output_matches 'INFO +redis-server shutdown complete'
}

@test "$SUITE: waits for redis-server on another host" {
  # This is effectively the same as the previous case, except that we're
  # specifying CUSTOM_LINKS_REDIS_HOST to simulate a remote server or Dockerized
  # service.
  start_local_redis
  CUSTOM_LINKS_REDIS_HOST='localhost' run_in_background ./go serve
  wait_for_background_output "custom-links listening on port $CUSTOM_LINKS_PORT"
  stop_background_run

  fail_if output_matches 'INFO +redis-server running'
  assert_output_matches 'INFO +custom-links server shutdown complete'
}

@test "$SUITE: error when redis-server launch fails" {
  stub_program_in_path 'redis-server' 'exit 1'
  CUSTOM_LINKS_REDIS_TIMEOUT='0' run_in_background ./go serve
  wait_for_background_output "FATAL +Failed to launch redis-server"
  restore_program_in_path 'redis-server'
  stop_background_run
  assert_failure
}
