#!/bin/sh -x

IMAGE_NAME=$1
BUILD=$2

if [ $# -lt 2 ]; then
  echo "Usage: $0 <image name> <build and push base (0/1)>"
  exit 2
fi

start_dir=`pwd`
cd `dirname $0`
script_dir=`pwd`

cd ../
# To avoid cache issues
git checkout HEAD package.json
git checkout HEAD bower.json

cd $script_dir
# To avoid cache issues
git checkout HEAD package.json
git checkout HEAD bower.json

mkdir -p deps

jq .dependencies ../package.json | sort | sed 's/,$//' > deps/package.orig
rc=$?
if [ "$rc" -eq "0" ]; then
  jq .dependencies ./package.json | sort | sed 's/,$//' > deps/package.current
  rc=$?
fi
if [ "$rc" -eq "0" ]; then
  diff deps/package.orig deps/package.current
  rc=$?
fi

if [ "$rc" -ne "0" ]; then
  if [ "$BUILD" -eq "0" ]; then
    echo "Base image out of date, asked not to build"
    exit 1
  fi
  cp ../package.json ./package.json
  docker build --build-arg NPM_SET="$NPM_SET" -t $IMAGE_NAME ./
  rc=$?
  if [ "$rc" -eq "0" ]; then
    echo pushing  $IMAGE_NAME
    docker push $IMAGE_NAME
  else
    exit 1
  fi
fi
