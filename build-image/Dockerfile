FROM docker:latest

RUN apk add --no-cache curl \
  gnupg \
  shadow \
  nodejs \
  bash \
  jq

# install nps (vulnerabilities - check package)
RUN npm install nps -g
