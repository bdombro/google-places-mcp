class GooglePlacesMcp < Formula
  desc "Google Places, Routes, and Geocoding MCP server (Pro tier and below)"
  homepage "https://github.com/bdombro/google-places-mcp"
  version "3.0.0"

  on_macos do
    url "https://github.com/bdombro/google-places-mcp/releases/download/v3.0.0/google-places-mcp-arm64-macos.tar.gz"
    sha256 "7dadabe62c9ba4fe9294c0cf4b5c46d6bd8d24ff51d82fda8d0f271c083a27f3"
  end

  on_linux do
    url "https://github.com/bdombro/google-places-mcp/releases/download/v3.0.0/google-places-mcp-x64-linux.tar.gz"
    sha256 "7c3b28421a98b78d35d11ac2bc4d7d09f3a0048dd58d24fd236a420b4cce934e"
  end

  def install
    bin.install "google-places-mcp"
    chmod 0755, bin/"google-places-mcp"
    pkgshare.install "docs" if File.directory?("docs")
  end

  def post_install
    (var/"google-places-mcp").mkpath
    chmod 0700, var/"google-places-mcp"
    (var/"log").mkpath
  end

  service do
    run ["/bin/sh", "-c", "[ -f #{etc}/google-places-mcp/env ] && set -a && . #{etc}/google-places-mcp/env; exec #{opt_bin}/google-places-mcp http --log-file #{var}/log/google-places-mcp.log"]
    keep_alive true
    working_dir var/"google-places-mcp"
    log_path var/"log/google-places-mcp.log"
    error_log_path var/"log/google-places-mcp.log"
    environment_variables PATH: "#{HOMEBREW_PREFIX}/bin:/usr/bin:/bin"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/google-places-mcp --version")
    discover = '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}'
    out = pipe_output("#{bin}/google-places-mcp mcp --skip-checks", "#{discover}\n")
    assert_match "google-places-mcp", out
  end
end
