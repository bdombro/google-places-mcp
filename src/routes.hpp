#pragma once

#include "google_client.hpp"
#include "places.hpp"
#include "types.hpp"
#include "util.hpp"
#include "json.hpp"

#include <algorithm>
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace google_places {

inline slimr::Json waypoint(std::string_view text, LatLng home) {
    size_t s = text.find_first_not_of(" \t\r\n");
    if (s == std::string_view::npos) {
        throw GoogleError("A route point can't be empty.");
    }
    std::string t = std::string(text.substr(s, text.find_last_not_of(" \t\r\n") - s + 1));

    std::string lower = t;
    for (char& c : lower) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));

    if (lower == "home") {
        slimr::Json j = slimr::Json::object_t{};
        j["location"]["latLng"]["latitude"] = home.lat;
        j["location"]["latLng"]["longitude"] = home.lng;
        return j;
    }

    auto point = parseLatLng(t);
    if (point) {
        slimr::Json j = slimr::Json::object_t{};
        j["location"]["latLng"]["latitude"] = point->lat;
        j["location"]["latLng"]["longitude"] = point->lng;
        return j;
    }

    std::string toCheck = t;
    if (toCheck.starts_with("place_id:")) {
        toCheck = toCheck.substr(9);
    }
    auto id = asPlaceId(toCheck);
    if (id) {
        slimr::Json j = slimr::Json::object_t{};
        j["placeId"] = *id;
        return j;
    }

    slimr::Json j = slimr::Json::object_t{};
    j["address"] = t.substr(0, 300);
    return j;
}

struct TransitDetails {
    std::optional<std::string> line;
    std::optional<std::string> vehicle;
    std::optional<std::string> headsign;
    std::optional<std::string> from;
    std::optional<std::string> to;
    std::optional<int64_t> stops;
    std::optional<std::string> departs;
    std::optional<std::string> arrives;

    slimr::Json toJson() const {
        slimr::Json j = slimr::Json::object_t{};
        if (line) j["line"] = *line;
        if (vehicle) j["vehicle"] = *vehicle;
        if (headsign) j["headsign"] = *headsign;
        if (from) j["from"] = *from;
        if (to) j["to"] = *to;
        if (stops) j["stops"] = *stops;
        if (departs) j["departs"] = *departs;
        if (arrives) j["arrives"] = *arrives;
        return j;
    }
};

struct RouteStep {
    std::optional<std::string> instruction;
    std::string distance;
    std::string duration;
    std::optional<std::string> mode;
    std::optional<TransitDetails> transit;

    slimr::Json toJson() const {
        slimr::Json j = slimr::Json::object_t{};
        if (instruction) j["instruction"] = *instruction;
        j["distance"] = distance;
        j["duration"] = duration;
        if (mode) j["mode"] = *mode;
        if (transit) j["transit"] = transit->toJson();
        return j;
    }
};

struct RouteResult {
    std::optional<std::string> summary;
    std::string duration;
    int64_t durationSeconds = 0;
    std::optional<int64_t> trafficFreeDurationSeconds;
    std::string distance;
    int64_t distanceMeters = 0;
    std::vector<std::string> warnings;
    std::vector<RouteStep> steps;

    slimr::Json toJson() const {
        slimr::Json j = slimr::Json::object_t{};
        if (summary) j["summary"] = *summary;
        j["duration"] = duration;
        j["durationSeconds"] = durationSeconds;
        if (trafficFreeDurationSeconds) j["trafficFreeDurationSeconds"] = *trafficFreeDurationSeconds;
        j["distance"] = distance;
        j["distanceMeters"] = distanceMeters;
        if (!warnings.empty()) {
            slimr::Json::array_t arr;
            for (const auto& w : warnings) arr.push_back(w);
            j["warnings"] = arr;
        }
        if (!steps.empty()) {
            slimr::Json::array_t arr;
            for (const auto& s : steps) arr.push_back(s.toJson());
            j["steps"] = arr;
        }
        return j;
    }
};

struct MatrixElement {
    int64_t originIndex = 0;
    int64_t destinationIndex = 0;
    std::string origin;
    std::string destination;
    bool routeFound = false;
    std::optional<std::string> duration;
    std::optional<int64_t> durationSeconds;
    std::optional<std::string> distance;
    std::optional<int64_t> distanceMeters;

    slimr::Json toJson() const {
        slimr::Json j = slimr::Json::object_t{};
        j["originIndex"] = originIndex;
        j["destinationIndex"] = destinationIndex;
        j["origin"] = origin;
        j["destination"] = destination;
        j["routeFound"] = routeFound;
        if (duration) j["duration"] = *duration;
        if (durationSeconds) j["durationSeconds"] = *durationSeconds;
        if (distance) j["distance"] = *distance;
        if (distanceMeters) j["distanceMeters"] = *distanceMeters;
        return j;
    }
};

inline void applyTiming(
    const PlacesConfig& config,
    slimr::Json& body,
    std::string_view mode,
    const std::optional<std::string>& departAt,
    const std::optional<std::string>& arriveBy,
    bool traffic,
    const std::vector<std::string>& avoid
) {
    bool motor = (mode == "drive" || mode == "two_wheeler");
    if (departAt && !departAt->empty() && arriveBy && !arriveBy->empty()) {
        throw GoogleError("Use either departAt or arriveBy, not both.");
    }

    if (departAt && !departAt->empty()) {
        if (mode == "walk" || mode == "bicycle") {
            throw GoogleError("departAt only applies to drive, two_wheeler and transit.");
        }
        body["departureTime"] = resolveTime(*departAt, config.timeZone);
    }

    if (arriveBy && !arriveBy->empty()) {
        if (mode != "transit") {
            throw GoogleError("arriveBy only applies to transit.");
        }
        body["arrivalTime"] = resolveTime(*arriveBy, config.timeZone);
    }

    if (motor && (traffic || (departAt && !departAt->empty()))) {
        body["routingPreference"] = "TRAFFIC_AWARE";
    }

    if (motor && !avoid.empty()) {
        bool avoidTolls = false;
        bool avoidHighways = false;
        bool avoidFerries = false;
        for (const auto& a : avoid) {
            if (a == "tolls") avoidTolls = true;
            else if (a == "highways") avoidHighways = true;
            else if (a == "ferries") avoidFerries = true;
        }
        body["routeModifiers"]["avoidTolls"] = avoidTolls;
        body["routeModifiers"]["avoidHighways"] = avoidHighways;
        body["routeModifiers"]["avoidFerries"] = avoidFerries;
    }
}

inline RouteStep toStep(const slimr::Json& raw) {
    RouteStep step;
    int64_t distMeters = 0;
    if (raw.contains("distanceMeters") && raw["distanceMeters"].is_number()) {
        distMeters = raw["distanceMeters"].get<int64_t>();
    }
    step.distance = formatDistance(distMeters);

    int64_t durSecs = 0;
    if (raw.contains("staticDuration") && raw["staticDuration"].is_string()) {
        durSecs = parseGoogleDuration(raw["staticDuration"].get<std::string>()).value_or(0);
    }
    step.duration = formatDuration(durSecs);

    if (raw.contains("navigationInstruction") && raw["navigationInstruction"].is_object()) {
        const auto& nav = raw["navigationInstruction"];
        if (nav.contains("instructions") && nav["instructions"].is_string()) {
            step.instruction = cleanText(nav["instructions"].get<std::string>(), 200);
        }
    }

    if (raw.contains("travelMode") && raw["travelMode"].is_string()) {
        std::string tm = raw["travelMode"].get<std::string>();
        for (char& c : tm) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
        step.mode = tm;
    }

    if (raw.contains("transitDetails") && raw["transitDetails"].is_object()) {
        const auto& t = raw["transitDetails"];
        TransitDetails td;

        if (t.contains("transitLine") && t["transitLine"].is_object()) {
            const auto& tl = t["transitLine"];
            std::string lineName;
            if (tl.contains("nameShort") && tl["nameShort"].is_string()) {
                lineName = tl["nameShort"].get<std::string>();
            } else if (tl.contains("name") && tl["name"].is_string()) {
                lineName = tl["name"].get<std::string>();
            }
            if (!lineName.empty()) {
                td.line = cleanText(lineName, 60);
            }
            if (tl.contains("vehicle") && tl["vehicle"].is_object() &&
                tl["vehicle"].contains("type") && tl["vehicle"]["type"].is_string()) {
                std::string veh = tl["vehicle"]["type"].get<std::string>();
                for (char& c : veh) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
                td.vehicle = veh;
            }
        }

        if (t.contains("headsign") && t["headsign"].is_string()) {
            td.headsign = cleanText(t["headsign"].get<std::string>(), 80);
        }

        if (t.contains("stopDetails") && t["stopDetails"].is_object()) {
            const auto& sd = t["stopDetails"];
            if (sd.contains("departureStop") && sd["departureStop"].is_object() &&
                sd["departureStop"].contains("name") && sd["departureStop"]["name"].is_string()) {
                td.from = cleanText(sd["departureStop"]["name"].get<std::string>(), 80);
            }
            if (sd.contains("arrivalStop") && sd["arrivalStop"].is_object() &&
                sd["arrivalStop"].contains("name") && sd["arrivalStop"]["name"].is_string()) {
                td.to = cleanText(sd["arrivalStop"]["name"].get<std::string>(), 80);
            }
            if (sd.contains("departureTime") && sd["departureTime"].is_string()) {
                td.departs = sd["departureTime"].get<std::string>();
            }
            if (sd.contains("arrivalTime") && sd["arrivalTime"].is_string()) {
                td.arrives = sd["arrivalTime"].get<std::string>();
            }
        }

        if (t.contains("stopCount") && t["stopCount"].is_number()) {
            td.stops = t["stopCount"].get<int64_t>();
        }

        step.transit = std::move(td);
    }

    return step;
}

inline std::optional<RouteResult> toRoute(const slimr::Json& raw, bool withSteps) {
    if (!raw.contains("duration") || !raw["duration"].is_string() ||
        !raw.contains("distanceMeters") || !raw["distanceMeters"].is_number()) {
        return std::nullopt;
    }

    auto secOpt = parseGoogleDuration(raw["duration"].get<std::string>());
    if (!secOpt) return std::nullopt;
    int64_t seconds = *secOpt;
    int64_t distMeters = raw["distanceMeters"].get<int64_t>();

    RouteResult route;
    route.duration = formatDuration(seconds);
    route.durationSeconds = seconds;
    route.distance = formatDistance(distMeters);
    route.distanceMeters = distMeters;

    if (raw.contains("description") && raw["description"].is_string()) {
        route.summary = cleanText(raw["description"].get<std::string>(), 160);
    }

    if (raw.contains("staticDuration") && raw["staticDuration"].is_string()) {
        auto freeOpt = parseGoogleDuration(raw["staticDuration"].get<std::string>());
        if (freeOpt && *freeOpt != seconds) {
            route.trafficFreeDurationSeconds = *freeOpt;
        }
    }

    if (raw.contains("warnings") && raw["warnings"].is_array()) {
        for (const auto& w : raw["warnings"].get<slimr::Json::array_t>()) {
            if (w.is_string()) {
                auto cleaned = cleanText(w.get<std::string>(), 200);
                if (cleaned) route.warnings.push_back(std::move(*cleaned));
            }
        }
    }

    if (withSteps && raw.contains("legs") && raw["legs"].is_array()) {
        for (const auto& leg : raw["legs"].get<slimr::Json::array_t>()) {
            if (leg.contains("steps") && leg["steps"].is_array()) {
                for (const auto& s : leg["steps"].get<slimr::Json::array_t>()) {
                    route.steps.push_back(toStep(s));
                }
            }
        }
    }

    return route;
}

inline std::string toTravelMode(std::string_view mode) {
    if (mode == "drive") return "DRIVE";
    if (mode == "walk") return "WALK";
    if (mode == "bicycle") return "BICYCLE";
    if (mode == "transit") return "TRANSIT";
    if (mode == "two_wheeler") return "TWO_WHEELER";
    return "DRIVE";
}

inline std::vector<RouteResult> computeRoute(
    const PlacesConfig& config,
    HttpTransport transport,
    std::string_view origin,
    std::string_view destination,
    std::string_view mode,
    const std::optional<std::string>& departAt,
    const std::optional<std::string>& arriveBy,
    bool traffic,
    const std::vector<std::string>& avoid,
    bool alternatives,
    bool steps
) {
    slimr::Json body = slimr::Json::object_t{};
    body["origin"] = waypoint(origin, config.home);
    body["destination"] = waypoint(destination, config.home);
    body["travelMode"] = toTravelMode(mode);
    body["units"] = "METRIC";
    body["languageCode"] = config.language;
    body["regionCode"] = config.region;

    if (alternatives) {
        body["computeAlternativeRoutes"] = true;
    }

    applyTiming(config, body, mode, departAt, arriveBy, traffic, avoid);

    std::string mask = "routes.duration,routes.staticDuration,routes.distanceMeters,routes.description,routes.warnings";
    if (steps) {
        mask += ",routes.legs.steps.navigationInstruction,routes.legs.steps.distanceMeters,routes.legs.steps.staticDuration,routes.legs.steps.travelMode,routes.legs.steps.transitDetails";
    }

    RequestSpec spec;
    spec.api = "routes";
    spec.method = "POST";
    spec.path = "/directions/v2:computeRoutes";
    spec.fieldMask = mask;
    spec.body = std::move(body);

    auto json = request(config, transport, spec);

    std::vector<RouteResult> out;
    if (json.contains("routes") && json["routes"].is_array()) {
        for (const auto& r : json["routes"].get<slimr::Json::array_t>()) {
            auto route = toRoute(r, steps);
            if (route) out.push_back(std::move(*route));
        }
    }
    return out;
}

inline std::vector<MatrixElement> computeMatrix(
    const PlacesConfig& config,
    HttpTransport transport,
    const std::vector<std::string>& rawOrigins,
    const std::vector<std::string>& rawDestinations,
    std::string_view mode,
    const std::optional<std::string>& departAt,
    bool traffic
) {
    // Expand pipe-separated items if present
    std::vector<std::string> origins;
    for (const auto& o : rawOrigins) {
        std::stringstream ss(o);
        std::string item;
        while (std::getline(ss, item, '|')) {
            size_t s = item.find_first_not_of(" \t\r\n");
            if (s != std::string::npos) {
                origins.push_back(item.substr(s, item.find_last_not_of(" \t\r\n") - s + 1));
            }
        }
    }

    std::vector<std::string> destinations;
    for (const auto& d : rawDestinations) {
        std::stringstream ss(d);
        std::string item;
        while (std::getline(ss, item, '|')) {
            size_t s = item.find_first_not_of(" \t\r\n");
            if (s != std::string::npos) {
                destinations.push_back(item.substr(s, item.find_last_not_of(" \t\r\n") - s + 1));
            }
        }
    }

    size_t pairs = origins.size() * destinations.size();
    size_t limit = (mode == "transit") ? 100 : 625;
    if (origins.size() > 25 || destinations.size() > 25 || pairs > limit) {
        throw GoogleError(
            "Too many pairs: at most 25 origins, 25 destinations and " + std::to_string(limit) +
            " pairs for " + std::string(mode) + " (got " + std::to_string(origins.size()) +
            "×" + std::to_string(destinations.size()) + ")."
        );
    }

    slimr::Json body = slimr::Json::object_t{};
    slimr::Json::array_t oArr;
    for (const auto& o : origins) {
        slimr::Json w = slimr::Json::object_t{};
        w["waypoint"] = waypoint(o, config.home);
        oArr.push_back(w);
    }
    body["origins"] = oArr;

    slimr::Json::array_t dArr;
    for (const auto& d : destinations) {
        slimr::Json w = slimr::Json::object_t{};
        w["waypoint"] = waypoint(d, config.home);
        dArr.push_back(w);
    }
    body["destinations"] = dArr;

    body["travelMode"] = toTravelMode(mode);
    body["languageCode"] = config.language;
    body["regionCode"] = config.region;

    applyTiming(config, body, mode, departAt, std::nullopt, traffic, {});

    RequestSpec spec;
    spec.api = "routes";
    spec.method = "POST";
    spec.path = "/distanceMatrix/v2:computeRouteMatrix";
    spec.fieldMask = "originIndex,destinationIndex,status,condition,distanceMeters,duration";
    spec.body = std::move(body);

    auto json = request(config, transport, spec);

    std::vector<MatrixElement> out;
    if (json.is_array()) {
        for (const auto& e : json.get<slimr::Json::array_t>()) {
            int64_t i = e.contains("originIndex") && e["originIndex"].is_number() ? e["originIndex"].get<int64_t>() : 0;
            int64_t j = e.contains("destinationIndex") && e["destinationIndex"].is_number() ? e["destinationIndex"].get<int64_t>() : 0;

            std::optional<int64_t> seconds;
            if (e.contains("duration") && e["duration"].is_string()) {
                seconds = parseGoogleDuration(e["duration"].get<std::string>());
            }

            bool found = false;
            if (e.contains("condition") && e["condition"].is_string() &&
                e["condition"].get<std::string>() == "ROUTE_EXISTS" &&
                seconds.has_value() &&
                e.contains("distanceMeters") && e["distanceMeters"].is_number()) {
                found = true;
            }

            MatrixElement me;
            me.originIndex = i;
            me.destinationIndex = j;
            if (i >= 0 && static_cast<size_t>(i) < origins.size()) {
                me.origin = cleanText(origins[i], 120).value_or("");
            }
            if (j >= 0 && static_cast<size_t>(j) < destinations.size()) {
                me.destination = cleanText(destinations[j], 120).value_or("");
            }
            me.routeFound = found;

            if (found) {
                me.durationSeconds = *seconds;
                me.duration = formatDuration(*seconds);
                int64_t dm = e["distanceMeters"].get<int64_t>();
                me.distanceMeters = dm;
                me.distance = formatDistance(dm);
            }

            out.push_back(std::move(me));
        }
    }

    std::sort(out.begin(), out.end(), [](const MatrixElement& a, const MatrixElement& b) {
        if (a.originIndex != b.originIndex) return a.originIndex < b.originIndex;
        return a.destinationIndex < b.destinationIndex;
    });

    return out;
}

} // namespace google_places
