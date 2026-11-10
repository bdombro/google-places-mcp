#pragma once

#include <cstdlib>
#include <map>
#include <optional>
#include <string>
#include <string_view>

namespace google_places {

struct LatLng {
    double lat = 0.0;
    double lng = 0.0;

    bool operator==(const LatLng& other) const = default;
};

inline constexpr LatLng DEFAULT_HOME{53.3813, -6.5918};

struct PlacesConfig {
    std::string apiKey;
    LatLng home = DEFAULT_HOME;
    std::string region = "ie";
    std::string language = "en";
    std::string timeZone = "Europe/Dublin";
};

} // namespace google_places
