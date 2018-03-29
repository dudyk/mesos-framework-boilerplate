"use strict";

function filterEmails(accessToken, refreshToken, profile, cb) {
    var matchFound = false;
    if (process.env.GOOGLE_FILTER && profile.emails) {
        var i;
        for (i = 0; i < profile.emails.length; i += 1) {
            if (profile.emails[i].type === "account" && profile.emails[i].value.match(process.env.GOOGLE_FILTER)) {
                matchFound = true;
            }
        }
    }
    if (matchFound || !process.env.GOOGLE_FILTER) {
        cb(null, profile);
    } else {
        cb(null, false);
    }
}

function homeRedirect(req, res) {
    // Successful authentication, redirect home.
    res.redirect("/");
}

function generateCallbackURL(req, strategy) {
    var callbackURL = "/auth/" + strategy + "/callback";
    if (req.headers.referer && req.headers.referer.match("/login/")) {
        callbackURL = req.headers.referer.replace(/\/login\/.*/, "/auth/" + strategy + "/callback");
    }
    return callbackURL;
}

function getBasePath(req) {
    var basePath = "/";
    if (req.headers.referer && req.headers.referer.match("/login/")) {
        basePath = req.headers.referer.replace(/login\/.*/, "").replace(/https?:\/\/[^\/]*/, "");
    }
    return basePath;
}

module.exports = {"homeRedirect": homeRedirect, "filterEmails": filterEmails, "generateCallbackURL": generateCallbackURL, "getBasePath": getBasePath};