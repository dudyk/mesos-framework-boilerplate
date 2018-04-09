#!/bin/sh -x

wd=`dirname $0`

. ${wd}/deploy/lib.sh

version=`getVersionString`

if [ ! -z "$TAG" ]; then
  echo "Skipping build for tags"
  exit 0
fi

${wd}/base_docker/build_base.sh $BASE_IMAGE 0
rc=$?
if [ $rc -ne 0 ];then
  exit $rc
fi

docker build --build-arg SRC_IMAGE=$BASE_IMAGE -t $IMAGE:$version .
rc=$?
if [ $rc -eq 0 ]; then
  docker push $IMAGE:$version
else
  exit $rc
fi

