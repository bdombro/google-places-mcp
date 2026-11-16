#pragma once

#include "json.hpp"
#include "types.hpp"
#include "util.hpp"
#include <httplib.h>

#include <algorithm>
#include <functional>
#include <map>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>

namespace google_places {

class GoogleError : public std::runtime_error {
  public:
    using std::runtime_error::runtime_error;
};

struct HttpCall {
    std::string method = "GET";
    std::string url;
    std::map<std::string, std::string> headers;
    std::string body;
};

struct HttpCallResponse {
    long status = 200;
    std::string body;
};

using HttpTransport = std::function<HttpCallResponse(const HttpCall &)>;

inline HttpCallResponse default_http_transport(const HttpCall &req) {
    auto schemePos = req.url.find("://");
    if (schemePos == std::string::npos) {
        throw GoogleError("Network error: invalid URL");
    }
    auto pathPos = req.url.find('/', schemePos + 3);
    auto queryPos = req.url.find('?', schemePos + 3);
    auto splitPos = std::min(pathPos, queryPos);
    std::string base = splitPos == std::string::npos ? req.url : req.url.substr(0, splitPos);
    std::string pathAndQuery = "/";
    if (splitPos != std::string::npos) {
        pathAndQuery = req.url[splitPos] == '?' ? "/" + req.url.substr(splitPos) : req.url.substr(splitPos);
    }

    httplib::Client cli(base);
    if (!cli.is_valid()) {
        throw GoogleError("Network error: invalid URL");
    }
    cli.set_connection_timeout(20, 0);
    cli.set_read_timeout(20, 0);
    cli.set_write_timeout(20, 0);
    cli.set_follow_location(true);

    httplib::Headers headers;
    std::string contentType;
    for (const auto &[k, v] : req.headers) {
        if (k == "Content-Type" || k == "content-type") {
            contentType = v;
        } else {
            headers.emplace(k, v);
        }
    }

    httplib::Result res;
    if (req.method == "POST") {
        res = cli.Post(pathAndQuery, headers, req.body, contentType);
    } else if (req.method == "GET") {
        res = cli.Get(pathAndQuery, headers);
    } else {
        throw GoogleError("Network error: unsupported HTTP method " + req.method);
    }

    if (!res) {
        auto err = res.error();
        if (err == httplib::Error::ConnectionTimeout || err == httplib::Error::Timeout ||
            err == httplib::Error::Read || err == httplib::Error::Write) {
            throw GoogleError("Google did not answer within 20 s.");
        }
        throw GoogleError("Network error: " + httplib::to_string(err));
    }

    return HttpCallResponse{.status = res->status, .body = std::move(res->body)};
}

inline std::string scrub(std::string_view text, std::string_view key) {
    if (key.empty())
        return std::string(text);
    std::string res(text);
    size_t pos = 0;
    while ((pos = res.find(key, pos)) != std::string::npos) {
        res.replace(pos, key.size(), "[key]");
        pos += 5;
    }
    return res;
}

inline std::optional<std::string> describeFailure(std::string_view api, long status, const slimr::Json &body) {
    if (api == "geocode") {
        std::string gStatus = body.contains("status") && body["status"].is_string() ? body["status"].get<std::string>() : "";
        if (status < 300 && (gStatus == "OK" || gStatus == "ZERO_RESULTS")) {
            return std::nullopt;
        }
        std::string message;
        if (body.contains("error_message") && body["error_message"].is_string()) {
            message = " " + body["error_message"].get<std::string>();
        }
        if (gStatus == "OVER_QUERY_LIMIT" || gStatus == "OVER_DAILY_LIMIT") {
            return "Geocoding quota exceeded." + message;
        }
        std::string statusStr = !gStatus.empty() ? gStatus : ("HTTP " + std::to_string(status));
        return "Geocoding failed (" + statusStr + ")." + message;
    }

    if (status < 300)
        return std::nullopt;

    std::string title = (api == "places") ? "Places API (New)" : "Routes API";
    std::string errMessage;
    std::string errStatus;
    std::string reason;
    std::string activationUrl;
    std::string serviceTitle;

    if (body.contains("error") && body["error"].is_object()) {
        const auto &errObj = body["error"];
        if (errObj.contains("message") && errObj["message"].is_string())
            errMessage = errObj["message"].get<std::string>();
        if (errObj.contains("status") && errObj["status"].is_string())
            errStatus = errObj["status"].get<std::string>();
        if (errObj.contains("details") && errObj["details"].is_array()) {
            for (const auto &d : errObj["details"].get<slimr::Json::array_t>()) {
                if (d.contains("reason") && d["reason"].is_string()) {
                    reason = d["reason"].get<std::string>();
                    if (d.contains("metadata") && d["metadata"].is_object()) {
                        if (d["metadata"].contains("activationUrl") && d["metadata"]["activationUrl"].is_string()) {
                            activationUrl = d["metadata"]["activationUrl"].get<std::string>();
                        }
                        if (d["metadata"].contains("serviceTitle") && d["metadata"]["serviceTitle"].is_string()) {
                            serviceTitle = d["metadata"]["serviceTitle"].get<std::string>();
                        }
                    }
                    break;
                }
            }
        }
    }

    if (reason == "SERVICE_DISABLED") {
        std::string t = !serviceTitle.empty() ? serviceTitle : title;
        std::string res = t + " is not enabled for this API key's Google Cloud project.";
        if (!activationUrl.empty()) {
            res += " Enable it at " + activationUrl;
        }
        return res;
    }

    std::string lowerMsg = errMessage;
    for (char &c : lowerMsg)
        c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));

    if (reason == "API_KEY_INVALID" || lowerMsg.find("api key not valid") != std::string::npos) {
        return "Google rejected the API key (invalid, or restricted to other APIs or referrers).";
    }

    if (status == 429 || errStatus == "RESOURCE_EXHAUSTED") {
        return "Google quota exceeded for " + title + "; try again later or raise the quota in Google Cloud.";
    }

    std::string res = title + " error " + std::to_string(status);
    if (!errStatus.empty())
        res += " " + errStatus;
    res += ": " + (!errMessage.empty() ? errMessage : "no details");
    return res;
}

struct RequestSpec {
    std::string api; // "places", "routes", "geocode"
    std::string method = "GET";
    std::string path;
    std::map<std::string, std::string> query;
    std::string fieldMask;
    slimr::Json body;
};

inline slimr::Json request(const PlacesConfig &config, HttpTransport transport, const RequestSpec &spec) {
    if (!transport) {
        transport = default_http_transport;
    }

    const std::string &key = config.apiKey;
    if (key.empty()) {
        throw GoogleError("GOOGLE_PLACES_API_KEY is not set.");
    }

    static const std::map<std::string, std::string> BASES = {
        {"places", "https://places.googleapis.com/v1"},
        {"routes", "https://routes.googleapis.com"},
        {"geocode", "https://maps.googleapis.com/maps/api/geocode/json"},
    };

    auto baseIt = BASES.find(spec.api);
    if (baseIt == BASES.end()) {
        throw GoogleError("Unknown API: " + spec.api);
    }

    std::string fullUrl = baseIt->second + spec.path;
    bool hasQuery = false;
    auto addQuery = [&](std::string_view k, std::string_view v) {
        fullUrl += hasQuery ? '&' : '?';
        hasQuery = true;
        fullUrl += httplib::encode_uri_component(std::string(k));
        fullUrl += '=';
        fullUrl += httplib::encode_uri_component(std::string(v));
    };

    for (const auto &[k, v] : spec.query) {
        addQuery(k, v);
    }

    HttpCall call;
    call.method = spec.method;

    if (spec.api == "geocode") {
        addQuery("key", key);
    } else {
        call.headers["X-Goog-Api-Key"] = key;
    }

    if (!spec.fieldMask.empty()) {
        call.headers["X-Goog-FieldMask"] = spec.fieldMask;
    }

    if (!spec.body.is_null()) {
        call.headers["Content-Type"] = "application/json";
        call.body = slimr::write_json(spec.body);
    }

    call.url = fullUrl;

    HttpCallResponse res;
    try {
        res = transport(call);
    } catch (const std::exception &e) {
        throw GoogleError(scrub(e.what(), key));
    }

    slimr::Json json;
    if (!res.body.empty()) {
        auto parsed = slimr::parse_json<slimr::Json>(res.body);
        if (parsed) {
            json = std::move(*parsed);
        } else {
            json = slimr::Json::object_t{};
            json["raw"] = res.body.substr(0, 300);
        }
    } else {
        json = slimr::Json::object_t{};
    }

    auto failure = describeFailure(spec.api, res.status, json);
    if (failure) {
        throw GoogleError(scrub(*failure, key));
    }

    return json;
}

} // namespace google_places
