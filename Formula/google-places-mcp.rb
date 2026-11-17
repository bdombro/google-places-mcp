class GooglePlacesMcp < Formula
  desc "Google Places, Routes, and Geocoding MCP server (Pro tier and below)"
  homepage "https://github.com/bdombro/google-places-mcp"
  version "3.1.1"

  on_macos do
    url "https://github.com/bdombro/google-places-mcp/releases/download/v3.1.1/google-places-mcp-arm64-macos.tar.gz"
    sha256 "6dea40321193d71251a2314a037c5496c4d3d2d721a32c84c858b115867db1e5"
  end

  on_linux do
    url "https://github.com/bdombro/google-places-mcp/releases/download/v3.1.1/google-places-mcp-x64-linux.tar.gz"
    sha256 "59a05fe6e6a84e04ac0c814629796806333e3e54f225a585f1fc9bc10407306c"
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
