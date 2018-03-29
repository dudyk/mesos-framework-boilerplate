"use strict";

// NPM modules
var express = require("express");
var passport = require("passport");
var GitLabStrategy = require("passport-gitlab2");
var GoogleStrategy = require("passport-google-oauth20");
var cookieParser = require("cookie-parser");
var cookieSession = require("cookie-session");
var requireEnv = require("require-environment-variables");

var authHelpers = require("./authHelpers");

function initAuth(app) {
    if (!process.env.AUTH_COOKIE_ENCRYPTION_KEY) {
        app.use("/login", function (req, res, next) {
            // Login not available if not defined
            res.status(404).end();
        });
        return;
    }
    app.set("trust proxy", "loopback, uniquelocal");
    var requiredVars = [];

    if (process.env.GITLAB_APP_ID) {
        requiredVars = requiredVars.concat(["GITLAB_APP_ID", "GITLAB_APP_SECRET"]);
    }
    if (process.env.GOOGLE_CLIENT_ID) {
        requiredVars = requiredVars.concat(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);
    }
    if (!process.env.GITLAB_APP_ID && !process.env.GOOGLE_CLIENT_ID) {
        console.log("Must provide GOOGLE_CLIENT_ID and/or GITLAB_APP_ID if you want authentication support.");
        requiredVars = requiredVars.concat(["GOOGLE_CLIENT_ID", "GITLAB_APP_ID"]);
    }

    // Check if we got the necessary info from the environment, otherwise fail directly!
    requireEnv(requiredVars);

    var cookieSessionOptions = {keys: [process.env.AUTH_COOKIE_ENCRYPTION_KEY + process.env.FRAMEWORK_NAME],
            name: process.env.FRAMEWORK_NAME + "_session",
            resave: false,
            saveUninitialized: false};
    app.use(cookieParser(process.env.AUTH_COOKIE_ENCRYPTION_KEY + process.env.FRAMEWORK_NAME));
    app.use(cookieSession(cookieSessionOptions));

    passport.serializeUser(function (user, done) {
        var userSerialized = {"id": user.id,
                "displayName": user.displayName,
                emails: user.emails.filter(function (email) {
            return !email.type || email.type === "account";
        })};
        done(null, JSON.stringify(userSerialized));
    });
    passport.deserializeUser(function (obj, done) {
        done(null, obj);
    });

    var gitLabSupported = false;
    var googleSupported = false;

    if (process.env.GITLAB_APP_ID && process.env.GITLAB_APP_SECRET) {
        passport.use(new GitLabStrategy({
            "baseURL": process.env.GITLAB_URL,
            "clientID": process.env.GITLAB_APP_ID,
            "clientSecret": process.env.GITLAB_APP_SECRET
        },
                function (accessToken, refreshToken, profile, cb) {
            cb(null, profile);
        }));
        gitLabSupported = true;
    }
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
        passport.use(new GoogleStrategy({
            "clientID": process.env.GOOGLE_CLIENT_ID,
            "clientSecret": process.env.GOOGLE_CLIENT_SECRET
        }, authHelpers.filterEmails));
        googleSupported = true;
    }
    app.use(passport.initialize());
    app.use(passport.session());
    if (gitLabSupported) {
        var gitlabCallbackURL;
        app.get("/auth/gitlab", function (req, res) {
            cookieSessionOptions.path = authHelpers.getBasePath(req);
            gitlabCallbackURL = authHelpers.generateCallbackURL(req, "gitlab");
            passport.authenticate("gitlab", {callbackURL: gitlabCallbackURL})(req, res);
        });
        app.get("/auth/gitlab/callback", function (req, res, next) {
            passport.authenticate("gitlab", {callbackURL: gitlabCallbackURL, failureRedirect: "/login"})(req, res, next);
        }, authHelpers.homeRedirect);
    }
    if (googleSupported) {
        var googleCallbackURL;
        app.get("/auth/google", function (req, res) {
            cookieSessionOptions.path = authHelpers.getBasePath(req);
            googleCallbackURL = authHelpers.generateCallbackURL(req, "google");
            var authFunction = passport.authenticate("google", {
                callbackURL: googleCallbackURL,
                scope: process.env.GOOGLE_SCOPE
                    ? process.env.GOOGLE_SCOPE.split(",")
                    : ["email", "profile"]
            }, null);
            authFunction(req, res);
        });


        app.get("/auth/google/callback", function (req, res, next) {
            passport.authenticate("google", {callbackURL: googleCallbackURL, failureRedirect: "/login"})(req, res, next);
        },
                authHelpers.homeRedirect);
    }
    app.get("/logout", function (req, res) {
        req.logout();
        req.session = null;
        res.clearCookie(cookieSessionOptions.name);
        res.redirect("/login");
    });
}

module.exports = initAuth;