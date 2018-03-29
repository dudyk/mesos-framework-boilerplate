#!/bin/bash

if [ -n "$CREDENTIALS_URL" ]; then
  wget -O creds.sh $CREDENTIALS_URL
  . creds.sh
fi

if [ -f ../setup.sh ]; then
  echo using setup.sh
  cat ../setup.sh
  . ../setup.sh
fi

if [ -f ../build-versions.json ]; then
  echo ../build-versions.json
  cat ../build-versions.json
fi

exec npm start
