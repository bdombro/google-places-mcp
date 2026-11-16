class GooglePlacesMcp < Formula
  desc "Google Places, Routes, and Geocoding MCP server (Pro tier and below)"
  homepage "https://github.com/bdombro/google-places-mcp"
  version "3.1.0"

  on_macos do
    url "https://github.com/bdombro/google-places-mcp/releases/download/v3.1.0/google-places-mcp-arm64-macos.tar.gz"
    sha256 "9787d8fae917da212759448ea5b32ecf2c78df2b6ae7ac2fd61e6ea885ec9637"
  end

  on_linux do
    url "https://github.com/bdombro/google-places-mcp/releases/download/v3.1.0/google-places-mcp-x64-linux.tar.gz"
    sha256 "0574fb5f18948dd4f8932241cbd56208fb6ad616ab5007268a18eb5aaf8a81c5"
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
    require "net/http"
    assert_match version.to_s, shell_output("#{bin}/google-places-mcp --version")
    r, w = IO.pipe
    pid = spawn("#{bin}/google-places-mcp", "--skip-checks", "http", "--host", "127.0.0.1", "--port", "0", err: w)
    w.close
    begin
      port = nil
      r.each_line { |line| break if (port = line[%r{listening on http://[\d.]+:(\d+)/mcp}, 1]) }
      assert port, "server did not report a listening port"
      discover = '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}'
      res = Net::HTTP.post(URI("http://127.0.0.1:#{port}/mcp"), discover,
                           "Content-Type"         => "application/json",
                           "Accept"               => "application/json, text/event-stream",
                           "MCP-Protocol-Version" => "2026-07-28",
                           "Mcp-Method"           => "server/discover")
      assert_match "google-places-mcp", res.body
    ensure
      Process.kill("TERM", pid)
      Process.wait(pid)
    end
  end
end
