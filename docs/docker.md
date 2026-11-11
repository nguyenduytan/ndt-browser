# Docker / Chạy trong container

## English

The image includes Node.js 24, Debian Chromium, both drivers, Xvfb and the built NDT
package. It runs as the non-root `node` user. Browser sandboxing is not disabled.
The npm library is small; an image containing Chromium and OS libraries is much larger.

### Build and run

From the cloned repository:

```bash
docker build --target runtime -t ndt-browser:0.1.0 .
docker run --rm --init --shm-size=1g --security-opt seccomp=./docker/seccomp_profile.json ndt-browser:0.1.0 node dist/cli.js scrape https://example.com --headless --selector h1
```

Use `--driver playwright` to switch drivers. No ports are published. This is a job
container, not an HTTP automation server. Host networking/proxy configuration must
be reachable from inside the container; `127.0.0.1` means the container itself.

### Compose and persistent profiles

```bash
docker compose build
docker compose run --rm ndt node dist/cli.js scrape https://example.com --headless --profile /data/profiles/example --selector h1
```

Named volumes retain profiles/output. Give each concurrent session a different
profile directory. `docker compose down` retains these volumes; `down -v` deletes
them, including saved cookies. The default limits are 2 GiB memory, 1 GiB shared
memory and 256 processes; tune them for your browser/page count.

### Your own scripts

Create a local `scripts/job.mjs` importing `@nguyenduytan/ndt-browser`, then mount it
inside `/opt/ndt` so Node can resolve the package's self-reference and dependencies:

```bash
docker run --rm --init --shm-size=1g --security-opt seccomp=./docker/seccomp_profile.json --mount type=bind,source="$(pwd)/scripts",target=/opt/ndt/scripts,readonly ndt-browser:0.1.0 node scripts/job.mjs
```

On PowerShell use `${PWD}/scripts` instead of `$(pwd)/scripts`. Pass only necessary
environment variables with `-e VARIABLE_NAME`; do not bake secrets into the image.
Use `/data/output` with a mounted volume for files you want to keep.

### Headed mode through Xvfb

```bash
docker run --rm --init --shm-size=1g --security-opt seccomp=./docker/seccomp_profile.json ndt-browser:0.1.0 xvfb-run -a node dist/cli.js scrape https://example.com --selector h1
```

Xvfb provides a virtual display. There is no VNC viewer included. It does not make a
container indistinguishable from a physical user's computer.

### Verify the image

```bash
docker build --target test -t ndt-browser:test .
docker run --rm --init --shm-size=1g --security-opt seccomp=./docker/seccomp_profile.json ndt-browser:test
```

This runs the complete local-fixture suite against the container's real Chromium.
GitHub CI builds this target and runs it. No live challenge target or paid proxy is
required. Runtime Dockerfiles install Debian's current Chromium at build time;
record/pin the image digest for repeatable deployment and rebuild for security updates.

### Sandbox compatibility

The included seccomp profile is the Playwright upstream Docker profile, allowing
the namespace operations Chromium needs. It does not use `--privileged` or disable
seccomp entirely. Some hosts additionally restrict unprivileged user namespaces
through kernel/AppArmor policy. Configure the host policy appropriately; NDT does
not silently add `--no-sandbox` when launch fails. See
[Playwright's Docker guidance](https://playwright.dev/docs/docker).

## Tiếng Việt

Image gồm Node.js 24, Debian Chromium, hai driver, Xvfb và NDT đã build. Chạy bằng
user `node` không phải root; không tắt browser sandbox. Package npm nhỏ nhưng image
có Chromium và thư viện OS sẽ lớn hơn đáng kể.

### Build và chạy

```bash
docker build --target runtime -t ndt-browser:0.1.0 .
docker run --rm --init --shm-size=1g --security-opt seccomp=./docker/seccomp_profile.json ndt-browser:0.1.0 node dist/cli.js scrape https://example.com --headless --selector h1
```

Đổi driver bằng `--driver playwright`. Container không mở cổng; đây là môi trường
chạy tác vụ, không phải HTTP automation server. Proxy phải truy cập được từ container;
`127.0.0.1` bên trong container không phải localhost của máy host.

### Compose và lưu profile

```bash
docker compose build
docker compose run --rm ndt node dist/cli.js scrape https://example.com --headless --profile /data/profiles/example --selector h1
```

Named volume giữ profile/output. Mỗi session chạy đồng thời dùng thư mục profile riêng.
`docker compose down` giữ volume; `down -v` xóa cả cookie đã lưu. Giới hạn mặc định:
2 GiB RAM, 1 GiB shared memory, 256 process; điều chỉnh theo tải thực tế.

### Script riêng, headed và kiểm thử

Tạo `scripts/job.mjs`, import `@nguyenduytan/ndt-browser`, mount vào `/opt/ndt/scripts`
và chạy `node scripts/job.mjs` như ví dụ English phía trên. PowerShell dùng
`${PWD}/scripts` cho đường dẫn host. Truyền secret qua biến môi trường cần thiết,
không đóng vào image. Mount volume `/data/output` để giữ file kết quả.

Dùng `xvfb-run -a node dist/cli.js scrape ...` để chạy headed trên display ảo; không
có VNC viewer và không có bảo đảm tránh detection chỉ nhờ dùng Xvfb/Docker.

```bash
docker build --target test -t ndt-browser:test .
docker run --rm --init --shm-size=1g --security-opt seccomp=./docker/seccomp_profile.json ndt-browser:test
```

Lệnh trên chạy toàn bộ test fixture local bằng Chromium thật trong container. CI cũng
build và test target này. Ghi lại image digest khi triển khai để tái lập đúng bản;
rebuild định kỳ để cập nhật bảo mật Chromium.

Seccomp profile từ Playwright upstream cho phép namespace cần thiết cho Chromium.
Một số host còn giới hạn user namespace qua kernel/AppArmor; cần cấu hình host phù
hợp, NDT không tự thêm `--no-sandbox` hoặc `--privileged` để bỏ qua lỗi.
