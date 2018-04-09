FROM node:alpine

MAINTAINER didi@zooz.com

# Set application name
ENV APP_NAME framework-core

# Set application directory
ENV APP_DIR /usr/local/${APP_NAME}

# Set node env to production, so that npm install doesn't install the devDependencies
ENV NODE_ENV production

# Change the workdir to the app's directory
WORKDIR ${APP_DIR}

# Add application
ADD . ${APP_DIR}

ARG NPM_SET
RUN $NPM_SET || true;npm install

CMD ["node", "index.js"]

