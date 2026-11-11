class GooglePlacesMcp < Formula
  desc "Google Places, Routes, and Geocoding MCP server (Pro tier and below)"
  homepage "https://github.com/bdombro/google-places-mcp"
  version "2.0.0"
  license "MIT"

  url "https://github.com/bdombro/google-places-mcp/releases/download/v2.0.0/google-places-mcp-v2.0.0-darwin-arm64.tar.gz"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"

  def install
    bin.install "google-places-mcp"
  end

  service do
    run [opt_bin/"google-places-mcp", "http", "--host", "127.0.0.1", "--port", "8084"]
    keep_alive true
    log_path var/"log/google-places-mcp.log"
    error_log_path var/"log/google-places-mcp.log"
  end

  def caveats
    <<~EOS
      HTTP MCP endpoint:
        http://127.0.0.1:8084/mcp

      Configure your Google Maps API key for the LaunchAgent in:
        ~/.config/google-places/config.json
      Example:
        {"apiKey":"YOUR_KEY","home":"53.3813,-6.5918","region":"ie","language":"en","timeZone":"Europe/Dublin"}
      Or set GOOGLE_PLACES_API_KEY in the LaunchAgent / environment (or load from macOS Keychain into config.json).
    EOS
  end

  test do
    output = shell_output("#{bin}/google-places-mcp status")
    assert_match "keyConfigured", output
  end
end
