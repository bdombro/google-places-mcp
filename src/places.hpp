#pragma once

#include "google_client.hpp"
#include "types.hpp"
#include "util.hpp"
#include "json.hpp"

#include <algorithm>
#include <cstdint>
#include <optional>
#include <regex>
#include <string>
#include <string_view>
#include <vector>

namespace google_places {

struct PlaceOut {
    std::string id;
    std::string name;
    std::optional<std::string> address;
    std::optional<double> lat;
    std::optional<double> lng;
    std::optional<std::string> type;
    std::optional<std::string> status;
    std::optional<std::string> mapsUrl;
    std::optional<int64_t> distanceM;

    slimr::Json toJson() const {
        slimr::Json j = slimr::Json::object_t{};
        j["id"] = id;
        j["name"] = name;
        if (address) j["address"] = *address;
        if (lat) j["lat"] = *lat;
        if (lng) j["lng"] = *lng;
        if (type) j["type"] = *type;
        if (status) j["status"] = *status;
        if (mapsUrl) j["mapsUrl"] = *mapsUrl;
        if (distanceM) j["distanceM"] = *distanceM;
        return j;
    }
};

struct PlacesOut {
    std::string near;
    LatLng center;
    std::vector<PlaceOut> places;
    std::string notice = std::string(UNTRUSTED_NOTICE);

    slimr::Json toJson() const {
        slimr::Json j = slimr::Json::object_t{};
        j["near"] = near;
        j["center"]["lat"] = center.lat;
        j["center"]["lng"] = center.lng;
        slimr::Json::array_t arr;
        for (const auto& p : places) {
            arr.push_back(p.toJson());
        }
        j["places"] = arr;
        j["notice"] = notice;
        return j;
    }
};

inline std::string placesText(const PlacesOut& out) {
    if (out.places.empty()) return "No places found near " + out.near + ".";
    std::string res = "Near " + out.near + ":";
    for (size_t i = 0; i < out.places.size(); ++i) {
        const auto& p = out.places[i];
        std::vector<std::string> bits;
        if (p.type) bits.push_back(*p.type);
        if (p.distanceM) bits.push_back(formatDistance(*p.distanceM));
        if (p.status) bits.push_back(*p.status);

        std::string bitsStr;
        for (size_t b = 0; b < bits.size(); ++b) {
            if (b > 0) bitsStr += ", ";
            bitsStr += bits[b];
        }

        res += "\n" + std::to_string(i + 1) + ". " + p.name;
        if (p.address) res += " — " + *p.address;
        if (!bitsStr.empty()) res += " (" + bitsStr + ")";
        res += "\n   " + p.id;
    }
    return res;
}

struct PhotoRef {
    std::string name;
    std::optional<int64_t> widthPx;
    std::optional<int64_t> heightPx;
    std::optional<std::string> author;

    slimr::Json toJson() const {
        slimr::Json j = slimr::Json::object_t{};
        j["name"] = name;
        if (widthPx) j["widthPx"] = *widthPx;
        if (heightPx) j["heightPx"] = *heightPx;
        if (author) j["author"] = *author;
        return j;
    }
};

struct DetailsResult {
    PlaceOut base;
    std::vector<std::string> types;
    std::optional<std::string> timeZone;
    std::vector<std::string> accessibility;
    std::vector<PhotoRef> photos;

    slimr::Json toJson() const {
        slimr::Json p = base.toJson();
        if (!types.empty()) {
            slimr::Json::array_t arr;
            for (const auto& t : types) arr.push_back(t);
            p["types"] = arr;
        }
        if (timeZone) p["timeZone"] = *timeZone;
        if (!accessibility.empty()) {
            slimr::Json::array_t arr;
            for (const auto& a : accessibility) arr.push_back(a);
            p["accessibility"] = arr;
        }
        if (!photos.empty()) {
            slimr::Json::array_t arr;
            for (const auto& ph : photos) arr.push_back(ph.toJson());
            p["photos"] = arr;
        }

        slimr::Json j = slimr::Json::object_t{};
        j["place"] = p;
        j["notice"] = std::string(UNTRUSTED_NOTICE);
        return j;
    }
};

struct Center {
    double lat = 0.0;
    double lng = 0.0;
    std::string label;
};

inline std::optional<PlaceOut> toPlace(const slimr::Json& raw, std::optional<LatLng> from = std::nullopt) {
    if (!raw.contains("id") || !raw["id"].is_string()) return std::nullopt;
    std::string id = raw["id"].get<std::string>();
    if (id.empty()) return std::nullopt;

    PlaceOut place;
    place.id = id;

    std::string nameText;
    if (raw.contains("displayName") && raw["displayName"].is_object() &&
        raw["displayName"].contains("text") && raw["displayName"]["text"].is_string()) {
        nameText = raw["displayName"]["text"].get<std::string>();
    }
    place.name = cleanText(nameText, 200).value_or("(unnamed)");

    if (raw.contains("formattedAddress") && raw["formattedAddress"].is_string()) {
        auto addr = cleanText(raw["formattedAddress"].get<std::string>(), 300);
        if (addr) place.address = addr;
    }

    if (raw.contains("location") && raw["location"].is_object()) {
        const auto& loc = raw["location"];
        if (loc.contains("latitude") && loc["latitude"].is_number() &&
            loc.contains("longitude") && loc["longitude"].is_number()) {
            double lat = loc["latitude"].get<double>();
            double lng = loc["longitude"].get<double>();
            place.lat = lat;
            place.lng = lng;
            if (from) {
                place.distanceM = distanceMeters(*from, LatLng{lat, lng});
            }
        }
    }

    if (raw.contains("primaryTypeDisplayName") && raw["primaryTypeDisplayName"].is_object() &&
        raw["primaryTypeDisplayName"].contains("text") && raw["primaryTypeDisplayName"]["text"].is_string()) {
        auto t = cleanText(raw["primaryTypeDisplayName"]["text"].get<std::string>(), 80);
        if (t) place.type = t;
    }

    if (raw.contains("businessStatus") && raw["businessStatus"].is_string()) {
        std::string status = raw["businessStatus"].get<std::string>();
        if (!status.empty() && status != "OPERATIONAL") {
            place.status = status;
        }
    }

    if (raw.contains("googleMapsUri") && raw["googleMapsUri"].is_string()) {
        std::string uri = raw["googleMapsUri"].get<std::string>();
        if (uri.starts_with("https://")) {
            place.mapsUrl = uri;
        }
    }

    return place;
}

inline std::optional<std::string> asPlaceId(std::string_view text) {
    size_t s = text.find_first_not_of(" \t\r\n");
    if (s == std::string_view::npos) return std::nullopt;
    text = text.substr(s, text.find_last_not_of(" \t\r\n") - s + 1);

    if (text.starts_with("places/")) {
        text.remove_prefix(7);
    }
    if (text.empty()) return std::nullopt;

    for (char c : text) {
        if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' || c == '-')) {
            return std::nullopt;
        }
    }

    if (text.starts_with("ChIJ") || text.length() >= 20) {
        return std::string(text);
    }
    return std::nullopt;
}

inline slimr::Json circle(LatLng center, double radiusM) {
    slimr::Json j = slimr::Json::object_t{};
    j["circle"]["center"]["latitude"] = center.lat;
    j["circle"]["center"]["longitude"] = center.lng;
    j["circle"]["radius"] = radiusM;
    return j;
}

inline std::vector<PlaceOut> placesFrom(const slimr::Json& json, LatLng from) {
    std::vector<PlaceOut> out;
    if (json.contains("places") && json["places"].is_array()) {
        for (const auto& item : json["places"].get<slimr::Json::array_t>()) {
            auto p = toPlace(item, from);
            if (p) out.push_back(std::move(*p));
        }
    }
    return out;
}

inline Center resolveCenter(const PlacesConfig& config, HttpTransport transport, std::optional<std::string_view> near) {
    std::string text;
    if (near) {
        std::string s(*near);
        size_t st = s.find_first_not_of(" \t\r\n");
        if (st != std::string::npos) text = s.substr(st, s.find_last_not_of(" \t\r\n") - st + 1);
    }

    std::string lower = text;
    for (char& c : lower) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));

    if (text.empty() || lower == "home") {
        return Center{.lat = config.home.lat, .lng = config.home.lng, .label = "home area"};
    }

    auto point = parseLatLng(text);
    if (point) {
        char buf[64];
        snprintf(buf, sizeof(buf), "%g,%g", point->lat, point->lng);
        return Center{.lat = point->lat, .lng = point->lng, .label = text};
    }

    RequestSpec spec;
    spec.api = "places";
    spec.method = "POST";
    spec.path = "/places:searchText";
    spec.fieldMask = "places.id,places.displayName,places.formattedAddress,places.location";
    spec.body = slimr::Json::object_t{};
    spec.body["textQuery"] = text;
    spec.body["maxResultCount"] = 1;
    spec.body["languageCode"] = config.language;
    spec.body["regionCode"] = config.region;
    spec.body["locationBias"] = circle(config.home, 50000);

    auto json = request(config, transport, spec);
    if (json.contains("places") && json["places"].is_array()) {
        const auto& arr = json["places"].get<slimr::Json::array_t>();
        if (!arr.empty()) {
            const auto& hit = arr[0];
            if (hit.contains("location") && hit["location"].is_object()) {
                const auto& loc = hit["location"];
                if (loc.contains("latitude") && loc["latitude"].is_number() &&
                    loc.contains("longitude") && loc["longitude"].is_number()) {
                    double lat = loc["latitude"].get<double>();
                    double lng = loc["longitude"].get<double>();
                    std::string labelText;
                    if (hit.contains("displayName") && hit["displayName"].is_object() &&
                        hit["displayName"].contains("text") && hit["displayName"]["text"].is_string()) {
                        labelText = hit["displayName"]["text"].get<std::string>();
                    }
                    std::string label = cleanText(labelText, 120).value_or(text);
                    return Center{.lat = lat, .lng = lng, .label = label};
                }
            }
        }
    }

    throw GoogleError("Couldn't find \"" + text + "\" to search near.");
}

inline std::string resolveId(const PlacesConfig& config, HttpTransport transport, std::string_view text, std::optional<std::string_view> near = std::nullopt) {
    auto center = resolveCenter(config, transport, near);

    RequestSpec spec;
    spec.api = "places";
    spec.method = "POST";
    spec.path = "/places:searchText";
    spec.fieldMask = "places.id";
    spec.body = slimr::Json::object_t{};
    spec.body["textQuery"] = std::string(text);
    spec.body["maxResultCount"] = 1;
    spec.body["languageCode"] = config.language;
    spec.body["regionCode"] = config.region;
    spec.body["locationBias"] = circle(LatLng{center.lat, center.lng}, 20000);

    auto json = request(config, transport, spec);
    if (json.contains("places") && json["places"].is_array()) {
        const auto& arr = json["places"].get<slimr::Json::array_t>();
        if (!arr.empty()) {
            const auto& hit = arr[0];
            if (hit.contains("id") && hit["id"].is_string()) {
                std::string id = hit["id"].get<std::string>();
                static const std::regex idRegex("^[A-Za-z0-9_-]+$");
                if (std::regex_match(id, idRegex)) {
                    return id;
                }
            }
        }
    }

    throw GoogleError("No place found for \"" + std::string(text) + "\".");
}

inline DetailsResult placeDetails(const PlacesConfig& config, HttpTransport transport, std::string_view place, std::optional<std::string_view> near = std::nullopt, int64_t photos = 0) {
    std::string id;
    auto directId = asPlaceId(place);
    if (directId) {
        id = *directId;
    } else {
        id = resolveId(config, transport, place, near);
    }

    std::string fieldMask = "id,displayName,formattedAddress,shortFormattedAddress,location,types,primaryTypeDisplayName,businessStatus,googleMapsUri,timeZone,accessibilityOptions";
    if (photos > 0) {
        fieldMask += ",photos";
    }

    RequestSpec spec;
    spec.api = "places";
    spec.method = "GET";
    spec.path = "/places/" + id;
    spec.query["languageCode"] = config.language;
    spec.query["regionCode"] = config.region;
    spec.fieldMask = fieldMask;

    auto raw = request(config, transport, spec);
    if (!raw.contains("id")) raw["id"] = id;

    auto base = toPlace(raw);
    if (!base) {
        throw GoogleError("Google returned no details for " + id + ".");
    }

    DetailsResult out;
    out.base = std::move(*base);

    if (raw.contains("shortFormattedAddress") && raw["shortFormattedAddress"].is_string()) {
        auto shortAddr = cleanText(raw["shortFormattedAddress"].get<std::string>(), 200);
        if (shortAddr && !out.base.address) {
            out.base.address = shortAddr;
        }
    }

    if (raw.contains("types") && raw["types"].is_array()) {
        static const std::regex typeRegex("^[a-z0-9_]+$");
        for (const auto& t : raw["types"].get<slimr::Json::array_t>()) {
            if (t.is_string()) {
                std::string tStr = t.get<std::string>();
                if (std::regex_match(tStr, typeRegex)) {
                    out.types.push_back(std::move(tStr));
                }
            }
        }
    }

    if (raw.contains("timeZone") && raw["timeZone"].is_object() &&
        raw["timeZone"].contains("id") && raw["timeZone"]["id"].is_string()) {
        out.timeZone = cleanText(raw["timeZone"]["id"].get<std::string>(), 60);
    }

    if (raw.contains("accessibilityOptions") && raw["accessibilityOptions"].is_object()) {
        for (const auto& [k, v] : raw["accessibilityOptions"].get<slimr::Json::object_t>()) {
            if (v.is_boolean() && v.get<bool>()) {
                out.accessibility.push_back(k);
            }
        }
    }

    if (photos > 0 && raw.contains("photos") && raw["photos"].is_array()) {
        static const std::regex photoRegex(R"(^places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]+$)");
        for (const auto& p : raw["photos"].get<slimr::Json::array_t>()) {
            if (static_cast<int64_t>(out.photos.size()) >= photos) break;
            if (p.contains("name") && p["name"].is_string()) {
                std::string pName = p["name"].get<std::string>();
                if (std::regex_match(pName, photoRegex)) {
                    PhotoRef pref;
                    pref.name = std::move(pName);
                    if (p.contains("widthPx") && p["widthPx"].is_number()) pref.widthPx = p["widthPx"].get<int64_t>();
                    if (p.contains("heightPx") && p["heightPx"].is_number()) pref.heightPx = p["heightPx"].get<int64_t>();
                    if (p.contains("authorAttributions") && p["authorAttributions"].is_array()) {
                        const auto& auths = p["authorAttributions"].get<slimr::Json::array_t>();
                        if (!auths.empty() && auths[0].contains("displayName") && auths[0]["displayName"].is_string()) {
                            pref.author = cleanText(auths[0]["displayName"].get<std::string>(), 80);
                        }
                    }
                    out.photos.push_back(std::move(pref));
                }
            }
        }
    }

    return out;
}

inline std::string photoUri(const PlacesConfig& config, HttpTransport transport, std::string_view name, int64_t maxWidthPx) {
    static const std::regex photoRegex(R"(^places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]+$)");
    std::string nameStr(name);
    if (!std::regex_match(nameStr, photoRegex)) {
        throw GoogleError("Photo must be a reference from details, like \"places/<id>/photos/<ref>\".");
    }

    RequestSpec spec;
    spec.api = "places";
    spec.method = "GET";
    spec.path = "/" + nameStr + "/media";
    spec.query["maxWidthPx"] = std::to_string(maxWidthPx);
    spec.query["skipHttpRedirect"] = "true";

    auto json = request(config, transport, spec);
    if (!json.contains("photoUri") || !json["photoUri"].is_string() ||
        !json["photoUri"].get<std::string>().starts_with("https://")) {
        throw GoogleError("Google returned no photo URL.");
    }
    return json["photoUri"].get<std::string>();
}

inline std::vector<PlaceOut> searchText(
    const PlacesConfig& config,
    HttpTransport transport,
    std::string_view query,
    LatLng center,
    double radiusM,
    std::optional<std::string_view> type,
    std::string_view rank,
    int64_t limit
) {
    RequestSpec spec;
    spec.api = "places";
    spec.method = "POST";
    spec.path = "/places:searchText";
    spec.fieldMask = "places.id,places.displayName,places.formattedAddress,places.location,places.primaryTypeDisplayName,places.businessStatus,places.googleMapsUri";

    spec.body = slimr::Json::object_t{};
    spec.body["textQuery"] = std::string(query);
    spec.body["maxResultCount"] = limit;
    spec.body["rankPreference"] = (rank == "distance") ? "DISTANCE" : "RELEVANCE";
    spec.body["languageCode"] = config.language;
    spec.body["regionCode"] = config.region;
    spec.body["locationBias"] = circle(center, radiusM);
    if (type && !type->empty()) {
        spec.body["includedType"] = std::string(*type);
    }

    auto json = request(config, transport, spec);
    return placesFrom(json, center);
}

inline std::vector<PlaceOut> searchNearby(
    const PlacesConfig& config,
    HttpTransport transport,
    LatLng center,
    double radiusM,
    const std::vector<std::string>& types,
    const std::vector<std::string>& exclude,
    std::string_view rank,
    int64_t limit
) {
    RequestSpec spec;
    spec.api = "places";
    spec.method = "POST";
    spec.path = "/places:searchNearby";
    spec.fieldMask = "places.id,places.displayName,places.formattedAddress,places.location,places.primaryTypeDisplayName,places.businessStatus,places.googleMapsUri";

    spec.body = slimr::Json::object_t{};
    slimr::Json::array_t incArr;
    for (const auto& t : types) incArr.push_back(t);
    spec.body["includedTypes"] = incArr;

    if (!exclude.empty()) {
        slimr::Json::array_t excArr;
        for (const auto& e : exclude) excArr.push_back(e);
        spec.body["excludedTypes"] = excArr;
    }

    spec.body["maxResultCount"] = limit;
    spec.body["rankPreference"] = (rank == "distance") ? "DISTANCE" : "POPULARITY";
    spec.body["languageCode"] = config.language;
    spec.body["regionCode"] = config.region;
    spec.body["locationRestriction"] = circle(center, radiusM);

    auto json = request(config, transport, spec);
    return placesFrom(json, center);
}

inline std::pair<Center, std::vector<PlaceOut>> resolvePlaces(
    const PlacesConfig& config,
    HttpTransport transport,
    std::string_view text,
    std::optional<std::string_view> near = std::nullopt,
    int64_t limit = 3
) {
    auto center = resolveCenter(config, transport, near);
    auto places = searchText(config, transport, text, LatLng{center.lat, center.lng}, 20000, std::nullopt, "relevance", limit);
    return {std::move(center), std::move(places)};
}

} // namespace google_places
