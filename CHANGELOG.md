# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- Built with argsbarg 8.3.0, so the bundle can join an `argsbarg gateway` (one process for several plugins).

### Added

- Tools: `search`, `nearby`, `resolve`, `details`, `photo` (Places API New), `route`, `matrix` (Routes API), `geocode` (Geocoding API) and `status`.
- Home-area bias (`PLACES_HOME`), region, language and time-zone settings.
- Traffic-aware routing only on request (`departAt`, `traffic`).

### Notes

- Limited to Google's Pro tier and below: no ratings, opening hours, prices, phone numbers, websites, reviews or attributes (Enterprise tiers). See the README.
