#include "app.hpp"

int main(int argc, char* argv[]) {
    return google_places::make_google_places_app().run(argc, argv);
}
