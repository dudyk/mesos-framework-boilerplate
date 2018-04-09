#!/bin/sh

function getVersionString() {
    if [ "$REF_NAME" = "master" ]; then
        version="$REF_NAME-$COMMIT_SHA"
    else
        version="$REF_NAME"
    fi

    echo $version
}