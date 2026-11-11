#include "app.hpp"
#include <mcp_http.hpp>

int main(int argc, char* argv[]) {
    auto app = google_places::make_google_places_app();
    slimr::enable_http(app, slimr::HttpServerOptions{.host = "127.0.0.1", .port = 8084});
    return app.run(argc, argv);
}
