# placecitivi (CCTV in places)

placecitivi is a CCTV map application: put cameras on a map, click a pin, and watch the live stream (popup preview + fullscreen).

It uses the go2rtc streaming engine under the hood, and adds a public landing map UI plus an authenticated admin UI for managing cameras and settings.

## Web UI

- Map (public): `/index.html`
- Stream (public): `/stream.html?src=<stream>`
- Admin (login required): `/admin.html`
- Streams UI (protected): `/streams.html`

## Quick start (Docker)

Build an image from this repo (so it includes your Placecitivi changes):

```bash
docker build -f docker/Dockerfile -t placecitivi:local .
docker run -d \
  --name placecitivi \
  --network host \
  --restart unless-stopped \
  -v "$(pwd)/config:/config" \
  placecitivi:local
```

Then open:

- `http://localhost:1984/index.html`
- `http://localhost:1984/admin.html`

## Configuration

- Config file: `/config/go2rtc.yaml`
- SQLite DB: `/config/cctv.sqlite` (persist it by mounting `/config`)

Minimal example:

```yaml
api:
  listen: ":1984"
  # Optional: enable basic auth (also unlocks protected endpoints)
  # username: admin
  # password: change_me

cctv:
  enabled: true
  db_path: /config/cctv.sqlite
  # Default admin credentials are admin/admin (change after first login)
```

## Credits

- placecitivi: bayuaji13 (bayu.xiii@gmail.com)
- go2rtc: Alexey Khit

## License

See `LICENSE`.
