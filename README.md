# 강신나 자금관리 배포본

## 실행
Node.js 22 이상에서 별도 npm 설치 없이 실행됩니다.

```bash
APP_PASSWORD=9899 node server.js
```

브라우저에서 `http://서버주소:3000`으로 접속합니다.

## Docker 권장 실행

```bash
cp .env.example .env
docker compose up -d --build
```

`data/` 폴더에 모든 공용 데이터가 저장됩니다. 이 폴더는 반드시 백업하세요. 서버는 변경 직전 상태를 `data/backups/`에 최대 50개 자동 보관합니다.

## 중요한 배포 조건
- **정적 호스팅(Netlify/GitHub Pages 등에 index.html만 업로드)으로 배포하면 안 됩니다.** 여러 팀이 같은 데이터를 써야 하므로 Node 서버가 필요합니다.
- Render/Railway 등을 쓸 경우 **영구 디스크(persistent disk/volume)** 를 `DATA_DIR`에 연결해야 합니다. 영구 디스크가 없으면 재배포 시 데이터가 사라질 수 있습니다.
- VPS/서버에서 Docker Compose로 실행하는 방식이 가장 단순합니다.
- 실제 인터넷 공개 시 HTTPS 리버스 프록시(Caddy/Nginx/Cloudflare)를 권장합니다.

## 접근 방식
공용 비밀번호는 서버 환경변수 `APP_PASSWORD`로 검증합니다. 기본값은 요청된 `9899`이며, 개인별 로그인은 없습니다.

## 동기화
허슬/엘리븐/로아미/강신나는 같은 서버 데이터를 사용합니다. 다른 기기에서 변경된 내용은 약 5초 내 자동 새로고침됩니다. 동시에 같은 데이터를 수정하면 최신 버전 충돌을 감지해 조용히 덮어쓰지 않고 다시 확인하도록 안내합니다.
