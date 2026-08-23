# encoding: UTF-8
require "socket"
require "uri"

ROOT = File.expand_path(".")
PORT = 8765
MIME = {
  ".html" => "text/html; charset=utf-8",
  ".css" => "text/css; charset=utf-8",
  ".js" => "application/javascript; charset=utf-8",
  ".json" => "application/json; charset=utf-8",
  ".svg" => "image/svg+xml",
  ".png" => "image/png",
  ".ico" => "image/x-icon",
}

server = TCPServer.new("127.0.0.1", PORT)
$stdout.puts "serving #{ROOT} on http://127.0.0.1:#{PORT}"
$stdout.flush

loop do
  client = server.accept
  request_line = client.gets
  next unless request_line

  _method, raw_path, _ = request_line.split(" ")
  while (line = client.gets)
    break if line == "\r\n" || line == "\n"
  end

  path = URI.decode_www_form_component((raw_path || "/").split("?").first)
  path = "/index.html" if path == "/"
  full = File.expand_path(File.join(ROOT, path))

  unless full.start_with?(ROOT + File::SEPARATOR) && File.file?(full)
    body = "Not Found"
    client.write "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nContent-Length: #{body.bytesize}\r\nConnection: close\r\n\r\n#{body}"
    client.close
    next
  end

  data = File.binread(full)
  type = MIME[File.extname(full)] || "application/octet-stream"
  client.write "HTTP/1.1 200 OK\r\nContent-Type: #{type}\r\nContent-Length: #{data.bytesize}\r\nConnection: close\r\n\r\n"
  client.write data
  client.close
rescue StandardError => error
  warn error.message
  begin
    client.close
  rescue StandardError
  end
end
