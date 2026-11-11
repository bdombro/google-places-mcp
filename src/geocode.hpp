#pragma once

#include "google_client.hpp"
#include "types.hpp"
#include "util.hpp"
#include "json.hpp"

#include <cstdint>
#include <optional>
#include <regex>
#include <string>
#include <string_view>
#include <vector>

namespace google_places {

struct GeocodeResult {
    std::string address;
    double lat = 0.0;
    double lng = 0.0;
    std::optional<std::string> placeId;
    std::vector<std::string> types;
    std::optional<std::string> precision;

    slimr::Json toJson() const {
        slimr::Json j = slimr::Json::object_t{};
        j["address"] = address;
        j["lat"] = lat;
        j["lng"] = lng;
        if (placeId) j["placeId"] = *placeId;
        if (!types.empty()) {
            slimr::Json::array_t arr;
            for (const auto& t : types) arr.push_back(t);
            j["types"] = arr;
        }
        if (precision) j["precision"] = *precision;
        return j;
    }
};

inline std::vector<GeocodeResult> geocode(
    const PlacesConfig& config,
    HttpTransport transport,
    std::string_view query,
    int64_t limit = 3
) {
    auto point = parseLatLng(query);

    RequestSpec spec;
    spec.api = "geocode";
    spec.method = "GET";

    if (point) {
        char buf[64];
        snprintf(buf, sizeof(buf), "%g,%g", point->lat, point->lng);
        spec.query["latlng"] = buf;
    } else {
        spec.query["address"] = std::string(query);
    }

    spec.query["region"] = config.region;
    spec.query["language"] = config.language;

    auto json = request(config, transport, spec);

    std::vector<GeocodeResult> out;
    if (json.contains("results") && json["results"].is_array()) {
        static const std::regex typeRegex("^[a-z0-9_]+$");

        for (const auto& r : json["results"].get<slimr::Json::array_t>()) {
            if (static_cast<int64_t>(out.size()) >= limit) break;

            if (!r.contains("geometry") || !r["geometry"].is_object()) continue;
            const auto& geom = r["geometry"];
            if (!geom.contains("location") || !geom["location"].is_object()) continue;
            const auto& loc = geom["location"];
            if (!loc.contains("lat") || !loc["lat"].is_number() ||
                !loc.contains("lng") || !loc["lng"].is_number()) {
                continue;
            }

            GeocodeResult gr;
            gr.lat = loc["lat"].get<double>();
            gr.lng = loc["lng"].get<double>();

            if (r.contains("formatted_address") && r["formatted_address"].is_string()) {
                gr.address = cleanText(r["formatted_address"].get<std::string>(), 300).value_or("");
            }

            if (r.contains("place_id") && r["place_id"].is_string()) {
                gr.placeId = r["place_id"].get<std::string>();
            }

            if (r.contains("types") && r["types"].is_array()) {
                for (const auto& t : r["types"].get<slimr::Json::array_t>()) {
                    if (t.is_string()) {
                        std::string tStr = t.get<std::string>();
                        if (std::regex_match(tStr, typeRegex)) {
                            gr.types.push_back(std::move(tStr));
                        }
                    }
                }
            }

            if (geom.contains("location_type") && geom["location_type"].is_string()) {
                gr.precision = geom["location_type"].get<std::string>();
            }

            out.push_back(std::move(gr));
        }
    }

    return out;
}

} // namespace google_places
