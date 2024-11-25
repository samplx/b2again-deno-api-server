#!/bin/bash

#
#	Copyright 2024 James Burlingame
#
#	Licensed under the Apache License, Version 2.0 (the "License");
#	you may not use this file except in compliance with the License.
#	You may obtain a copy of the License at
#
#	    http://www.apache.org/licenses/LICENSE-2.0
#
#	Unless required by applicable law or agreed to in writing, software
#	distributed under the License is distributed on an "AS IS" BASIS,
#	WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#	See the License for the specific language governing permissions and
#	limitations under the License.
#

PLUPERFECT="${PLUPERFECT:-"./pluperfect.ts"}"
BUILD_DIR="${BUILD_DIR:-"./build"}"
RUN_DIR="${RUN_DIR:-"${BUILD_DIR}/run"}"
LOG_DIR="${LOG_DIR:-"${BUILD_DIR}/logs"}"
STEP_PACE_SECONDS="${STEP_PACE_SECONDS:-"1800"}"

if [ "$#" -ne 1 ] || [ "$1" == '--help' ]
then
    echo "Usage: $0 core|patterns|plugins|themes"
    echo "this script runs ${PLUPERFECT} in a loop until"
    echo "a sentinel file is removed."
    exit 2
fi
case "$1" in
    core|patterns|plugins|themes)
        ;;
    *)
        echo "Error: unrecognized section $1"
        echo "Expected one of core, patterns, plugins or themes."
        exit 2
        ;;
esac

SECTION="$1"
SENTINEL_FILE="${RUN_OK_FILE:-"${RUN_DIR}/${SECTION}.ok"}"
COUNTER_FILE="${COUNTER_FILE:-"${RUN_DIR}/${SECTION}-counter.txt"}"
ERROR_LOG="${LOG_DIR}/${SECTION}-errors.txt"

[ -d "$RUN_DIR" ] || mkdir -p "$RUN_DIR"
[ -d "$LOG_DIR" ] || mkdir -p "$LOG_DIR"

if [ -f "$COUNTER_FILE" ]
then
    COUNTER="$(cat "$COUNTER_FILE")"
else
    COUNTER="0"
fi

touch "$SENTINEL_FILE"

while [ -f "$SENTINEL_FILE" ]
do
    START_TIME="$(date '+%s')"
    COUNTER=$((COUNTER + 1))
    echo "$COUNTER" > "$COUNTER_FILE"
    LOGFILE="${LOG_DIR}/${SECTION}-${COUNTER}.json"
    if "$PLUPERFECT" --json "--${SECTION}" >> "$LOGFILE" 2>> "$ERROR_LOG"
    then
        END_TIME="$(date '+%s')"
        STEP_WAIT="$((STEP_PACE_SECONDS - ( END_TIME - START_TIME ) ))"
        # echo "START_TIME=$START_TIME"
        # echo "END_TIME  =$END_TIME"
        # echo "STEP_WAIT =$STEP_WAIT"
        if [ "$STEP_WAIT" -gt 0 ]
        then
            # echo sleep "$STEP_WAIT"
            sleep "$STEP_WAIT"
        fi
    fi
done
